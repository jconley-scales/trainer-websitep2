import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendBookingConfirmation, sendBookingCancellation, sendBookingMoved, notifyTrainerOfBooking, db } = vi.hoisted(() => {
  /**
   * A stand-in for the Supabase query builder: every call chains, and awaiting
   * the chain gives the next of `db.queue`, else `db.result`. `db.calls`
   * records the chain for assertions.
   */
  const db = {
    result: { data: [] as unknown[] | null, error: null as { code?: string } | null },
    queue: [] as { data: unknown[] | null; error: { code?: string } | null }[],
    user: { id: "u1" } as { id: string } | null,
    calls: [] as [string, unknown[]][],
  };
  return {
    sendBookingConfirmation: vi.fn(),
    sendBookingCancellation: vi.fn(),
    sendBookingMoved: vi.fn(),
    notifyTrainerOfBooking: vi.fn(),
    db,
  };
});

vi.mock("@/lib/notify", () => ({ sendBookingConfirmation, sendBookingCancellation, sendBookingMoved, notifyTrainerOfBooking }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "update", "insert", "eq", "neq", "in", "lt", "gt", "order", "select"]) {
      chain[method] = (...args: unknown[]) => {
        db.calls.push([method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(db.queue.shift() ?? db.result);
    // Only the query chain is awaitable; the client itself must not be.
    return { from: chain.from, auth: { getUser: async () => ({ data: { user: db.user } }) } };
  },
}));

import { addBooking, cancelBooking, confirmBooking, editBooking, resendConfirmation, setBookingStatus } from "@/app/admin/actions";

const ID = "2b9f6c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const ROW = {
  id: ID,
  name: "Jordan Tester",
  email: "jordan@example.com",
  starts_at: "2030-10-25T13:00:00Z",
  ends_at: "2030-10-25T14:00:00Z",
};

beforeEach(() => {
  sendBookingConfirmation.mockReset();
  sendBookingConfirmation.mockResolvedValue(undefined);
  sendBookingCancellation.mockReset();
  sendBookingCancellation.mockResolvedValue(undefined);
  sendBookingMoved.mockReset();
  sendBookingMoved.mockResolvedValue(undefined);
  notifyTrainerOfBooking.mockReset();
  db.queue = [];
  db.result = { data: [ROW], error: null };
  db.user = { id: "u1" };
  db.calls = [];
});

describe("confirmBooking", () => {
  it("saves the confirmation, then emails the client with the trainer's note", async () => {
    const result = await confirmBooking(ID, "Meet at Oakledge Park.");

    expect(result).toEqual({ ok: true, emailed: true });
    expect(db.calls).toContainEqual(["update", [{ status: "confirmed" }]]);
    expect(sendBookingConfirmation).toHaveBeenCalledWith({
      name: "Jordan Tester",
      email: "jordan@example.com",
      startsAt: "2030-10-25T13:00:00Z",
      endsAt: "2030-10-25T14:00:00Z",
      note: "Meet at Oakledge Park.",
      sessionType: null,
    });
  });

  it("names the booking's session type in the Confirmed email", async () => {
    db.result = { data: [{ ...ROW, session_type: "partner" }], error: null };
    await confirmBooking(ID, "");
    expect(db.calls).toContainEqual(["select", ["name, email, starts_at, ends_at, session_type"]]);
    expect(sendBookingConfirmation).toHaveBeenCalledWith(expect.objectContaining({ sessionType: "partner" }));
  });

  it("only confirms a new request, so a repeat tap cannot email the client twice", async () => {
    await confirmBooking(ID, "");
    expect(db.calls).toContainEqual(["eq", ["status", "new"]]);
  });

  it("never stores the note: only the status is written", async () => {
    await confirmBooking(ID, "Meet at Oakledge Park.");
    const updates = db.calls.filter(([m]) => m === "update");
    expect(updates).toEqual([["update", [{ status: "confirmed" }]]]);
  });

  it("keeps the booking confirmed and reports it when the email fails", async () => {
    sendBookingConfirmation.mockRejectedValue(new Error("SMTP down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await confirmBooking(ID, "");

    expect(result).toEqual({ ok: true, emailed: false });
  });

  it("rejects a note over 500 characters, saving and sending nothing", async () => {
    const result = await confirmBooking(ID, "x".repeat(501));

    expect(result).toEqual({
      ok: false,
      error: "Please shorten the note to 500 characters or fewer.",
    });
    expect(db.calls).toEqual([]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("accepts a note of exactly 500 characters", async () => {
    const result = await confirmBooking(ID, "x".repeat(500));
    expect(result).toEqual({ ok: true, emailed: true });
  });

  it("rejects a note that is not text, or a bad id", async () => {
    expect(await confirmBooking(ID, 42 as unknown as string)).toMatchObject({ ok: false });
    expect(await confirmBooking("not-a-uuid", "")).toMatchObject({ ok: false });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("sends nothing when the booking was not changed (already confirmed, or not an admin)", async () => {
    db.result = { data: [], error: null };
    const result = await confirmBooking(ID, "");
    expect(result).toEqual({
      ok: false,
      error: "That booking could not be changed. Please refresh the page.",
    });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("confirms a booking that has no email (a reopened trainer booking) and says nobody was emailed", async () => {
    db.result = { data: [{ ...ROW, email: null }], error: null };
    expect(await confirmBooking(ID, "")).toEqual({ ok: true, emailed: null });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("re-checks the session", async () => {
    db.user = null;
    await expect(confirmBooking(ID, "")).rejects.toThrow("NEXT_REDIRECT");
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("confirms without emailing when the trainer chooses Don't email the client", async () => {
    expect(await confirmBooking(ID, "Meet at Oakledge Park.", true)).toEqual({ ok: true, emailed: null });
    expect(db.calls).toContainEqual(["update", [{ status: "confirmed" }]]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("only skips the email for a real true, so a stray value sent by direct POST still emails", async () => {
    expect(await confirmBooking(ID, "", "yes" as unknown as boolean)).toEqual({ ok: true, emailed: true });
    expect(sendBookingConfirmation).toHaveBeenCalledOnce();
  });

  it("re-checks the session even when not emailing", async () => {
    db.user = null;
    await expect(confirmBooking(ID, "", true)).rejects.toThrow("NEXT_REDIRECT");
    expect(db.calls.filter(([m]) => m === "update")).toEqual([]);
  });
});

describe("cancelBooking", () => {
  /** The booking as it was before cancelling, then the row the cancel update returns. */
  function bookingWas(status: "new" | "confirmed") {
    db.queue = [
      { data: [{ ...ROW, status }], error: null },
      { data: [{ id: ID }], error: null },
    ];
  }

  it("turns down a new request and sends the can't-make-it email with the reason", async () => {
    bookingWas("new");
    const result = await cancelBooking(ID, "I'm away that week.");

    expect(result).toEqual({ ok: true, emailed: true });
    expect(db.calls).toContainEqual(["update", [{ status: "cancelled" }]]);
    expect(sendBookingCancellation).toHaveBeenCalledTimes(1);
    expect(sendBookingCancellation).toHaveBeenCalledWith({
      name: "Jordan Tester",
      email: "jordan@example.com",
      startsAt: "2030-10-25T13:00:00Z",
      endsAt: "2030-10-25T14:00:00Z",
      wasConfirmed: false,
      reason: "I'm away that week.",
    });
  });

  it("cancels a confirmed session and sends the session-cancelled email", async () => {
    bookingWas("confirmed");
    const result = await cancelBooking(ID, "");

    expect(result).toEqual({ ok: true, emailed: true });
    expect(sendBookingCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ wasConfirmed: true, reason: "" }),
    );
  });

  it("only cancels the booking in the state it was read in, so the right email goes out once", async () => {
    bookingWas("confirmed");
    await cancelBooking(ID, "");
    const afterUpdate = db.calls.slice(db.calls.findIndex(([m]) => m === "update"));
    expect(afterUpdate).toContainEqual(["eq", ["status", "confirmed"]]);
  });

  it("never stores the reason: only the status is written", async () => {
    bookingWas("new");
    await cancelBooking(ID, "I'm away that week.");
    const updates = db.calls.filter(([m]) => m === "update");
    expect(updates).toEqual([["update", [{ status: "cancelled" }]]]);
  });

  it("keeps the booking cancelled and reports it when the email fails", async () => {
    bookingWas("new");
    sendBookingCancellation.mockRejectedValue(new Error("SMTP down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await cancelBooking(ID, "")).toEqual({ ok: true, emailed: false });
  });

  it("rejects a reason over 500 characters, saving and sending nothing", async () => {
    const result = await cancelBooking(ID, "x".repeat(501));

    expect(result).toEqual({
      ok: false,
      error: "Please shorten the reason to 500 characters or fewer.",
    });
    expect(db.calls).toEqual([]);
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("accepts a reason of exactly 500 characters", async () => {
    bookingWas("new");
    expect(await cancelBooking(ID, "x".repeat(500))).toEqual({ ok: true, emailed: true });
  });

  it("rejects a reason that is not text, or a bad id", async () => {
    expect(await cancelBooking(ID, 42 as unknown as string)).toMatchObject({ ok: false });
    expect(await cancelBooking("not-a-uuid", "")).toMatchObject({ ok: false });
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("sends nothing when there is no live booking to cancel (already cancelled, or not an admin)", async () => {
    db.result = { data: [], error: null };
    expect(await cancelBooking(ID, "")).toEqual({
      ok: false,
      error: "That booking could not be changed. Please refresh the page.",
    });
    expect(db.calls.some(([m]) => m === "update")).toBe(false);
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("sends nothing when the booking changed in between (e.g. cancelled in another tab)", async () => {
    db.queue = [{ data: [{ ...ROW, status: "new" }], error: null }, { data: [], error: null }];
    expect(await cancelBooking(ID, "")).toMatchObject({ ok: false });
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("cancels a booking that has no email (added by the trainer) and says nobody was emailed", async () => {
    db.queue = [
      { data: [{ ...ROW, email: null, status: "confirmed" }], error: null },
      { data: [{ id: ID }], error: null },
    ];
    expect(await cancelBooking(ID, "")).toEqual({ ok: true, emailed: null });
    expect(db.calls).toContainEqual(["update", [{ status: "cancelled" }]]);
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("re-checks the session", async () => {
    db.user = null;
    await expect(cancelBooking(ID, "")).rejects.toThrow("NEXT_REDIRECT");
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("cancels without emailing when the trainer chooses Don't email the client", async () => {
    bookingWas("confirmed");
    expect(await cancelBooking(ID, "I'm away that week.", true)).toEqual({ ok: true, emailed: null });
    expect(db.calls).toContainEqual(["update", [{ status: "cancelled" }]]);
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("only skips the email for a real true, so a stray value sent by direct POST still emails", async () => {
    bookingWas("new");
    expect(await cancelBooking(ID, "", 1 as unknown as boolean)).toEqual({ ok: true, emailed: true });
    expect(sendBookingCancellation).toHaveBeenCalledOnce();
  });

  it("re-checks the session even when not emailing", async () => {
    db.user = null;
    await expect(cancelBooking(ID, "", true)).rejects.toThrow("NEXT_REDIRECT");
    expect(db.calls.filter(([m]) => m === "update")).toEqual([]);
  });
});

describe("setBookingStatus", () => {
  it("reopens a booking without emailing anyone", async () => {
    const result = await setBookingStatus(ID, "new");
    expect(result).toEqual({ ok: true });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
    expect(sendBookingCancellation).not.toHaveBeenCalled();
  });

  it("only reopens a cancelled booking, so a confirmed one cannot slip back to new without an email", async () => {
    await setBookingStatus(ID, "new");
    expect(db.calls).toContainEqual(["eq", ["status", "cancelled"]]);
  });

  it("no longer cancels: cancelling always goes through cancelBooking and its email", async () => {
    const result = await setBookingStatus(ID, "cancelled");
    expect(result).toMatchObject({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("no longer confirms: confirming always goes through confirmBooking and its email", async () => {
    const result = await setBookingStatus(ID, "confirmed");
    expect(result).toMatchObject({ ok: false });
    expect(db.calls).toEqual([]);
  });
});

describe("addBooking", () => {
  /** Tuesday, October 22, 2030 (a closed day on the public schedule) at 10:15 AM for 45 minutes, name only. */
  const PHONE_BOOKING = {
    name: "Jane Doe",
    email: "",
    phone: "",
    note: "",
    date: "2030-10-22",
    time: "10:15",
    minutes: 45,
    sessionType: "partner" as const,
  };
  /** 10:15 AM EDT is 14:15 UTC. */
  const STARTS = "2030-10-22T14:15:00.000Z";
  const ENDS = "2030-10-22T15:00:00.000Z";

  type Reply = { data: unknown[] | null; error: { code?: string } | null };

  /** The live bookings that overlap the new one, then the result of the insert. */
  function overlapping(rows: { name: string; starts_at: string }[], insert: Reply = { data: [{ id: ID }], error: null }) {
    db.queue = [{ data: rows, error: null }, insert];
  }

  const inserts = () => db.calls.filter(([m]) => m === "insert");

  it("saves a confirmed admin booking on a closed day, at any quarter hour, for any length, with only a name", async () => {
    overlapping([]);
    const result = await addBooking(PHONE_BOOKING);

    expect(result).toEqual({ ok: true, emailed: null });
    expect(inserts()).toEqual([
      [
        "insert",
        [
          {
            name: "Jane Doe",
            email: null,
            phone: null,
            note: null,
            starts_at: STARTS,
            ends_at: ENDS,
            status: "confirmed",
            source: "admin",
            session_type: "partner",
          },
        ],
      ],
    ]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("sends the client the Confirmed email when an email is given, and never the trainer's new-booking email", async () => {
    overlapping([]);
    const result = await addBooking({
      ...PHONE_BOOKING,
      email: " Jane@Example.com ",
      phone: "555 010 2030",
      note: "Knee is better now.",
    });

    expect(result).toEqual({ ok: true, emailed: true });
    expect(inserts()[0][1][0]).toMatchObject({
      email: "jane@example.com",
      phone: "555 010 2030",
      note: "Knee is better now.",
    });
    expect(sendBookingConfirmation).toHaveBeenCalledWith({
      name: "Jane Doe",
      email: "jane@example.com",
      startsAt: STARTS,
      endsAt: ENDS,
      note: "",
      sessionType: "partner",
    });
    expect(notifyTrainerOfBooking).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "pair", "Partner", 1])(
    "rejects a booking posted with session type %j, saving and sending nothing",
    async (sessionType) => {
      overlapping([]);
      expect(await addBooking({ ...PHONE_BOOKING, sessionType } as never)).toEqual({
        ok: false,
        error: "Please choose the kind of session.",
      });
      expect(db.calls).toEqual([]);
      expect(sendBookingConfirmation).not.toHaveBeenCalled();
    },
  );

  it("keeps the booking and reports it when the Confirmed email fails", async () => {
    overlapping([]);
    sendBookingConfirmation.mockRejectedValue(new Error("SMTP down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await addBooking({ ...PHONE_BOOKING, email: "jane@example.com" })).toEqual({ ok: true, emailed: false });
  });

  it("blocks a booking at exactly the start time of a live booking, even when overlaps are allowed", async () => {
    overlapping([{ name: "Sam Lee", starts_at: "2030-10-22T14:15:00+00:00" }]);
    const result = await addBooking({ ...PHONE_BOOKING, allowOverlap: true });

    expect(result).toEqual({ ok: false, error: "Another booking already holds that time. Please choose another." });
    expect(inserts()).toEqual([]);
  });

  it("blocks the same way when another booking takes the time in the meantime", async () => {
    overlapping([], { data: null, error: { code: "23505" } });
    expect(await addBooking(PHONE_BOOKING)).toEqual({
      ok: false,
      error: "Another booking already holds that time. Please choose another.",
    });
  });

  it("warns about an overlap, naming the other booking, and saves nothing", async () => {
    overlapping([{ name: "Sam Lee", starts_at: "2030-10-22T13:30:00Z" }]);
    const result = await addBooking(PHONE_BOOKING);

    expect(result).toEqual({ ok: false, overlap: true, error: "This overlaps Sam's 9:30 AM session." });
    expect(inserts()).toEqual([]);
  });

  it("names every overlapping booking", async () => {
    overlapping([
      { name: "Sam Lee", starts_at: "2030-10-22T13:30:00Z" },
      { name: "Ana Ruiz", starts_at: "2030-10-22T14:45:00Z" },
    ]);
    expect(await addBooking(PHONE_BOOKING)).toMatchObject({
      error: "This overlaps Sam's 9:30 AM session and Ana's 10:45 AM session.",
    });
  });

  it("looks for overlaps among live bookings only", async () => {
    overlapping([]);
    await addBooking(PHONE_BOOKING);
    expect(db.calls).toContainEqual(["neq", ["status", "cancelled"]]);
    expect(db.calls).toContainEqual(["lt", ["starts_at", ENDS]]);
    expect(db.calls).toContainEqual(["gt", ["ends_at", STARTS]]);
  });

  it("saves anyway after an overlap warning", async () => {
    overlapping([{ name: "Sam Lee", starts_at: "2030-10-22T13:30:00Z" }]);
    expect(await addBooking({ ...PHONE_BOOKING, allowOverlap: true })).toEqual({ ok: true, emailed: null });
    expect(inserts()).toHaveLength(1);
  });

  it.each([
    [{ name: "  " }, "Please enter the client's name."],
    [{ name: "x".repeat(121) }, "Please shorten the name to 120 characters or fewer."],
    [{ email: "jane@" }, "Please check the email address, or leave it blank."],
    [{ phone: "1".repeat(41) }, "That phone number looks too long. Please check it."],
    [{ note: "x".repeat(2001) }, "Please shorten the note to 2000 characters or fewer."],
    [{ date: "2030-02-30" }, "Please choose a date and a start time."],
    [{ time: "10:10" }, "Please choose a start time on the quarter hour."],
    [{ minutes: 50 }, "Please choose how long the session is."],
    [{ minutes: 0 }, "Please choose how long the session is."],
    [{ date: "2020-01-07" }, "Please choose a time that hasn't passed yet."],
  ])("rejects %o, saving and sending nothing", async (change, error) => {
    overlapping([]);
    expect(await addBooking({ ...PHONE_BOOKING, ...change })).toEqual({ ok: false, error });
    expect(db.calls).toEqual([]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("rejects input that is not the right shape (posted by hand)", async () => {
    expect(await addBooking(null as never)).toMatchObject({ ok: false });
    expect(await addBooking({ ...PHONE_BOOKING, name: 42 } as never)).toMatchObject({ ok: false });
    expect(await addBooking({ ...PHONE_BOOKING, minutes: "45" } as never)).toMatchObject({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("reports a failed save without emailing anyone", async () => {
    overlapping([], { data: null, error: { code: "42501" } });
    expect(await addBooking({ ...PHONE_BOOKING, email: "jane@example.com" })).toEqual({
      ok: false,
      error: "Sorry, that did not save. Please try again.",
    });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("re-checks the session", async () => {
    db.user = null;
    await expect(addBooking(PHONE_BOOKING)).rejects.toThrow("NEXT_REDIRECT");
    expect(inserts()).toEqual([]);
  });
});

describe("editBooking", () => {
  type Reply = { data: unknown[] | null; error: { code?: string } | null };

  /** Jordan's booking as it stands: Friday, October 25, 2030, 9:00 to 10:00 AM (13:00Z). */
  const CURRENT = {
    status: "confirmed",
    source: "website",
    email: "jordan@example.com",
    starts_at: "2030-10-25T13:00:00+00:00",
    ends_at: "2030-10-25T14:00:00+00:00",
    session_type: "one-on-one",
  };
  /** The form, filled in with the booking unchanged. */
  const UNCHANGED = {
    id: ID,
    name: "Jordan Tester",
    email: "jordan@example.com",
    phone: "",
    note: "",
    date: "2030-10-25",
    time: "09:00",
    minutes: 60,
    sessionType: "one-on-one" as const,
  };
  /** Moved to Sunday, October 27 at 11:00 AM (15:00Z), still an hour. */
  const MOVED = { ...UNCHANGED, date: "2030-10-27", time: "11:00" };
  const NEW_STARTS = "2030-10-27T15:00:00.000Z";
  const NEW_ENDS = "2030-10-27T16:00:00.000Z";

  const saved: Reply = { data: [{ id: ID }], error: null };

  /** A details-only edit reads the booking, then updates it. */
  function detailsEdit(current: object = CURRENT, update: Reply = saved) {
    db.queue = [{ data: [current], error: null }, update];
  }
  /** A move reads the booking, then the live bookings it would overlap, then updates it. */
  function move(
    current: object = CURRENT,
    overlaps: { name: string; starts_at: string }[] = [],
    update: Reply = saved,
  ) {
    db.queue = [{ data: [current], error: null }, { data: overlaps, error: null }, update];
  }

  const updates = () => db.calls.filter(([m]) => m === "update").map(([, args]) => args[0]);

  it("saves new details without emailing anyone, and keeps the time and status", async () => {
    detailsEdit();
    const result = await editBooking({
      ...UNCHANGED,
      name: " Jordan T. Tester ",
      email: " Jordan@Example.org ",
      phone: "555 010 2030",
      note: "Bad left knee.",
    });

    expect(result).toEqual({ ok: true, moved: false, confirmed: false, emailed: null });
    expect(updates()).toEqual([
      {
        name: "Jordan T. Tester",
        email: "jordan@example.org",
        phone: "555 010 2030",
        note: "Bad left knee.",
        starts_at: "2030-10-25T13:00:00.000Z",
        ends_at: "2030-10-25T14:00:00.000Z",
        session_type: "one-on-one",
      },
    ]);
    expect(sendBookingMoved).not.toHaveBeenCalled();
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("changes only the session type as a details edit, emailing nobody", async () => {
    detailsEdit({ ...CURRENT, status: "new" });
    const result = await editBooking({ ...UNCHANGED, sessionType: "virtual-partner" });

    expect(result).toEqual({ ok: true, moved: false, confirmed: false, emailed: null });
    expect(updates()).toEqual([expect.objectContaining({ session_type: "virtual-partner" })]);
    expect(updates()[0]).not.toHaveProperty("status");
    expect(sendBookingMoved).not.toHaveBeenCalled();
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("saves a booking made before session types without one, leaving its type unrecorded", async () => {
    detailsEdit({ ...CURRENT, session_type: null });
    expect(await editBooking({ ...UNCHANGED, note: "Prefers mornings.", sessionType: null })).toMatchObject({ ok: true });
    expect(updates()[0]).toMatchObject({ note: "Prefers mornings." });
    expect(updates()[0]).not.toHaveProperty("session_type");
  });

  it("lets a booking made before session types be given one", async () => {
    detailsEdit({ ...CURRENT, session_type: null });
    expect(await editBooking({ ...UNCHANGED, sessionType: "partner" })).toMatchObject({ ok: true });
    expect(updates()[0]).toMatchObject({ session_type: "partner" });
  });

  it("does not let a recorded session type be cleared", async () => {
    detailsEdit();
    expect(await editBooking({ ...UNCHANGED, sessionType: null })).toEqual({
      ok: false,
      error: "Please choose the kind of session.",
    });
    expect(updates()).toEqual([]);
  });

  it("emails the client the old and new times when a confirmed booking moves", async () => {
    move();
    const result = await editBooking(MOVED);

    expect(result).toEqual({ ok: true, moved: true, confirmed: false, emailed: true });
    expect(updates()).toEqual([expect.objectContaining({ starts_at: NEW_STARTS, ends_at: NEW_ENDS })]);
    expect(updates()[0]).not.toHaveProperty("status");
    expect(sendBookingMoved).toHaveBeenCalledWith({
      name: "Jordan Tester",
      email: "jordan@example.com",
      oldStartsAt: CURRENT.starts_at,
      startsAt: NEW_STARTS,
      endsAt: NEW_ENDS,
      sessionType: "one-on-one",
    });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("names the session type as edited in the moved and Confirmed emails, and none when there is none", async () => {
    move();
    await editBooking({ ...MOVED, sessionType: "partner" });
    expect(sendBookingMoved).toHaveBeenCalledWith(expect.objectContaining({ sessionType: "partner" }));

    move({ ...CURRENT, status: "new", session_type: null });
    await editBooking({ ...MOVED, sessionType: "virtual-one-on-one" });
    expect(sendBookingConfirmation).toHaveBeenCalledWith(expect.objectContaining({ sessionType: "virtual-one-on-one" }));

    move({ ...CURRENT, session_type: null });
    sendBookingMoved.mockClear();
    await editBooking({ ...MOVED, sessionType: null });
    expect(sendBookingMoved).toHaveBeenCalledWith(expect.objectContaining({ sessionType: null }));
  });

  it("counts a new length as a move, since the session's end time changes", async () => {
    move();
    expect(await editBooking({ ...UNCHANGED, minutes: 90 })).toMatchObject({ moved: true, emailed: true });
    expect(sendBookingMoved).toHaveBeenCalledWith(expect.objectContaining({ endsAt: "2030-10-25T14:30:00.000Z" }));
  });

  it("confirms a new request when it moves, and sends the Confirmed email for the new time instead", async () => {
    move({ ...CURRENT, status: "new", session_type: "one-on-one" });
    const result = await editBooking(MOVED);

    expect(result).toEqual({ ok: true, moved: true, confirmed: true, emailed: true });
    expect(updates()[0]).toMatchObject({ status: "confirmed", starts_at: NEW_STARTS });
    expect(sendBookingConfirmation).toHaveBeenCalledWith({
      name: "Jordan Tester",
      email: "jordan@example.com",
      startsAt: NEW_STARTS,
      endsAt: NEW_ENDS,
      note: "",
      sessionType: "one-on-one",
    });
    expect(sendBookingMoved).not.toHaveBeenCalled();
  });

  it("leaves a new request unconfirmed when only its details change", async () => {
    detailsEdit({ ...CURRENT, status: "new" });
    expect(await editBooking({ ...UNCHANGED, note: "Prefers mornings." })).toMatchObject({ confirmed: false });
    expect(updates()[0]).not.toHaveProperty("status");
  });

  it("sends no email when the trainer ticks Don't email the client, but still saves the move", async () => {
    move({ ...CURRENT, status: "new" });
    expect(await editBooking({ ...MOVED, skipEmail: true })).toEqual({
      ok: true,
      moved: true,
      confirmed: true,
      emailed: null,
    });
    expect(updates()).toHaveLength(1);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
    expect(sendBookingMoved).not.toHaveBeenCalled();
  });

  it("moves an admin booking with no email, emailing nobody", async () => {
    move({ ...CURRENT, source: "admin", email: null });
    expect(await editBooking({ ...MOVED, email: "" })).toEqual({ ok: true, moved: true, confirmed: false, emailed: null });
    expect(updates()[0]).toMatchObject({ email: null, phone: null, note: null });
    expect(sendBookingMoved).not.toHaveBeenCalled();
  });

  it("emails the address as edited, when the email is corrected in the same save", async () => {
    move();
    await editBooking({ ...MOVED, email: "jordan.tester@example.com" });
    expect(sendBookingMoved).toHaveBeenCalledWith(expect.objectContaining({ email: "jordan.tester@example.com" }));
  });

  it("keeps the move saved and reports it when the email fails", async () => {
    move();
    sendBookingMoved.mockRejectedValue(new Error("SMTP down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await editBooking(MOVED)).toEqual({ ok: true, moved: true, confirmed: false, emailed: false });
    expect(updates()).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
  });

  it("does not check for overlaps when the time is unchanged", async () => {
    detailsEdit();
    await editBooking({ ...UNCHANGED, phone: "555 0100" });
    expect(db.calls.map(([m]) => m)).not.toContain("lt");
  });

  it("looks for overlaps among other live bookings only, not the one being moved", async () => {
    move();
    await editBooking(MOVED);
    expect(db.calls).toContainEqual(["neq", ["status", "cancelled"]]);
    expect(db.calls).toContainEqual(["neq", ["id", ID]]);
    expect(db.calls).toContainEqual(["lt", ["starts_at", NEW_ENDS]]);
    expect(db.calls).toContainEqual(["gt", ["ends_at", NEW_STARTS]]);
  });

  it("blocks a move onto exactly the start of another live booking, even when overlaps are allowed", async () => {
    move(CURRENT, [{ name: "Sam Lee", starts_at: "2030-10-27T15:00:00+00:00" }]);
    expect(await editBooking({ ...MOVED, allowOverlap: true })).toEqual({
      ok: false,
      error: "Another booking already holds that time. Please choose another.",
    });
    expect(updates()).toEqual([]);
  });

  it("blocks the same way when another booking takes the time in the meantime", async () => {
    move(CURRENT, [], { data: null, error: { code: "23505" } });
    expect(await editBooking(MOVED)).toEqual({
      ok: false,
      error: "Another booking already holds that time. Please choose another.",
    });
    expect(sendBookingMoved).not.toHaveBeenCalled();
  });

  it("warns about an overlap, naming the other booking, and saves nothing until Save anyway", async () => {
    move(CURRENT, [{ name: "Sam Lee", starts_at: "2030-10-27T14:30:00Z" }]);
    expect(await editBooking(MOVED)).toEqual({ ok: false, overlap: true, error: "This overlaps Sam's 10:30 AM session." });
    expect(updates()).toEqual([]);

    db.calls = [];
    move(CURRENT, [{ name: "Sam Lee", starts_at: "2030-10-27T14:30:00Z" }]);
    expect(await editBooking({ ...MOVED, allowOverlap: true })).toMatchObject({ ok: true, moved: true });
    expect(updates()).toHaveLength(1);
  });

  it("only edits a live booking, as it was read, so a change in another tab saves and sends nothing", async () => {
    move();
    await editBooking(MOVED);
    expect(db.calls).toContainEqual(["in", ["status", ["new", "confirmed"]]]);
    expect(db.calls).toContainEqual(["eq", ["status", "confirmed"]]);
    expect(db.calls).toContainEqual(["eq", ["starts_at", CURRENT.starts_at]]);

    db.calls = [];
    sendBookingMoved.mockClear();
    move(CURRENT, [], { data: [], error: null });
    expect(await editBooking(MOVED)).toEqual({
      ok: false,
      error: "That booking could not be changed. Please refresh the page.",
    });
    expect(sendBookingMoved).not.toHaveBeenCalled();
  });

  it("refuses a cancelled booking (or anything a non-admin cannot see)", async () => {
    db.queue = [{ data: [], error: null }];
    expect(await editBooking(MOVED)).toEqual({
      ok: false,
      error: "That booking could not be changed. Please refresh the page.",
    });
    expect(updates()).toEqual([]);
  });

  it("refuses a booking that has already started", async () => {
    detailsEdit({ ...CURRENT, starts_at: "2020-01-07T14:00:00+00:00", ends_at: "2020-01-07T15:00:00+00:00" });
    expect(await editBooking(MOVED)).toEqual({
      ok: false,
      error: "This session has already started, so it can't be changed.",
    });
    expect(updates()).toEqual([]);
  });

  it("says the session has started when the database refuses the edit for that reason", async () => {
    move(CURRENT, [], { data: null, error: { code: "PF002" } });
    expect(await editBooking(MOVED)).toEqual({
      ok: false,
      error: "This session has already started, so it can't be changed.",
    });
    expect(sendBookingMoved).not.toHaveBeenCalled();
  });

  it("keeps an email on a website booking, but lets an admin booking drop it", async () => {
    detailsEdit();
    expect(await editBooking({ ...UNCHANGED, email: "  " })).toEqual({
      ok: false,
      error: "A booking made on the website needs an email address. Please add one.",
    });
    expect(updates()).toEqual([]);

    detailsEdit({ ...CURRENT, source: "admin" });
    expect(await editBooking({ ...UNCHANGED, email: "" })).toMatchObject({ ok: true });
    expect(updates()[0]).toMatchObject({ email: null });
  });

  it("never changes where the booking came from", async () => {
    move();
    await editBooking(MOVED);
    expect(updates()[0]).not.toHaveProperty("source");
  });

  it.each([
    [{ name: "  " }, "Please enter the client's name."],
    [{ email: "jordan@" }, "Please check the email address, or leave it blank."],
    [{ time: "10:10" }, "Please choose a start time on the quarter hour."],
    [{ minutes: 50 }, "Please choose how long the session is."],
    [{ date: "2020-01-07" }, "Please choose a time that hasn't passed yet."],
    [{ sessionType: "pair" }, "Please choose the kind of session."],
  ])("checks the fields like adding a booking: rejects %o, touching nothing", async (change, error) => {
    move();
    expect(await editBooking({ ...MOVED, ...change } as never)).toEqual({ ok: false, error });
    expect(db.calls).toEqual([]);
  });

  it("rejects input that is not the right shape, or a bad id (posted by hand)", async () => {
    expect(await editBooking(null as never)).toMatchObject({ ok: false });
    expect(await editBooking({ ...MOVED, id: "not-a-uuid" })).toMatchObject({ ok: false });
    expect(await editBooking({ ...MOVED, id: 42 } as never)).toMatchObject({ ok: false });
    expect(await editBooking({ ...MOVED, minutes: "60" } as never)).toMatchObject({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("reports a failed save without emailing anyone", async () => {
    move(CURRENT, [], { data: null, error: { code: "42501" } });
    expect(await editBooking(MOVED)).toEqual({ ok: false, error: "Sorry, that did not save. Please try again." });
    expect(sendBookingMoved).not.toHaveBeenCalled();
  });

  it("re-checks the session", async () => {
    db.user = null;
    await expect(editBooking(MOVED)).rejects.toThrow("NEXT_REDIRECT");
    expect(updates()).toEqual([]);
  });
});

describe("resendConfirmation", () => {
  const CONFIRMED = { ...ROW, status: "confirmed", session_type: "partner" };
  beforeEach(() => {
    db.result = { data: [CONFIRMED], error: null };
  });

  it("sends the Confirmed email again for a confirmed future booking, with the trainer's new note", async () => {
    const result = await resendConfirmation(ID, "  Video link: https://meet.example.com/jordan  ");

    expect(result).toEqual({ ok: true, sentTo: "jordan@example.com" });
    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
    expect(sendBookingConfirmation).toHaveBeenCalledWith({
      name: "Jordan Tester",
      email: "jordan@example.com",
      startsAt: "2030-10-25T13:00:00Z",
      endsAt: "2030-10-25T14:00:00Z",
      note: "Video link: https://meet.example.com/jordan",
      sessionType: "partner",
    });
  });

  it("never stores the note: nothing is written", async () => {
    await resendConfirmation(ID, "Video link: https://meet.example.com/jordan");
    expect(db.calls.filter(([m]) => m === "update" || m === "insert")).toEqual([]);
  });

  it("rejects a note over 500 characters, reading and sending nothing", async () => {
    const result = await resendConfirmation(ID, "x".repeat(501));
    expect(result).toEqual({ ok: false, error: "Please shorten the note to 500 characters or fewer." });
    expect(db.calls).toEqual([]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("rejects a note that is not text (posted by hand)", async () => {
    expect(await resendConfirmation(ID, 42 as unknown as string)).toMatchObject({ ok: false });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("re-checks the session, reading and sending nothing when signed out", async () => {
    db.user = null;
    await expect(resendConfirmation(ID, "")).rejects.toThrow("NEXT_REDIRECT");
    expect(db.calls).toEqual([]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("only resends for a confirmed booking: a new or cancelled one (or one a non-admin can't see) sends nothing", async () => {
    db.result = { data: [], error: null };
    const result = await resendConfirmation(ID, "");
    expect(result).toEqual({
      ok: false,
      error: "This booking isn't confirmed any more, so there's nothing to resend. Please refresh the page.",
    });
    expect(db.calls).toContainEqual(["eq", ["status", "confirmed"]]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("refuses a session that has already started, sending nothing", async () => {
    db.result = {
      data: [{ ...CONFIRMED, starts_at: new Date(Date.now() - 60_000).toISOString() }],
      error: null,
    };
    const result = await resendConfirmation(ID, "");
    expect(result).toEqual({
      ok: false,
      error: "This session has already started, so there's no need to resend its confirmation.",
    });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("refuses a booking with no email on file (added by the trainer), sending nothing", async () => {
    db.result = { data: [{ ...CONFIRMED, email: null }], error: null };
    const result = await resendConfirmation(ID, "");
    expect(result).toEqual({
      ok: false,
      error: "This booking has no email address. Add one with Edit, or let them know yourself.",
    });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("reports plainly when the email does not send, and changes nothing in the database", async () => {
    sendBookingConfirmation.mockRejectedValue(new Error("SMTP down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await resendConfirmation(ID, "");

    expect(result).toEqual({
      ok: false,
      error: "The email to Jordan didn't send. Please try again in a few minutes, or call or email them yourself.",
    });
    expect(db.calls.filter(([m]) => m === "update" || m === "insert")).toEqual([]);
  });

  it("rejects a bad id (posted by hand) without reading or sending anything", async () => {
    expect(await resendConfirmation("not-a-uuid", "")).toMatchObject({ ok: false });
    expect(await resendConfirmation(42 as unknown as string, "")).toMatchObject({ ok: false });
    expect(db.calls).toEqual([]);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("asks the trainer to try again when the booking can't be read, sending nothing", async () => {
    db.result = { data: null, error: { code: "08006" } };
    const result = await resendConfirmation(ID, "");
    expect(result).toEqual({ ok: false, error: "Sorry, that did not send. Please try again." });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });
});
