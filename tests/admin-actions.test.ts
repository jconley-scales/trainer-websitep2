import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendBookingConfirmation, sendBookingCancellation, db } = vi.hoisted(() => {
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
  return { sendBookingConfirmation: vi.fn(), sendBookingCancellation: vi.fn(), db };
});

vi.mock("@/lib/notify", () => ({ sendBookingConfirmation, sendBookingCancellation }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "update", "eq", "in", "select"]) {
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

import { cancelBooking, confirmBooking, setBookingStatus } from "@/app/admin/actions";

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
    });
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

  it("re-checks the session", async () => {
    db.user = null;
    await expect(confirmBooking(ID, "")).rejects.toThrow("NEXT_REDIRECT");
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
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

  it("re-checks the session", async () => {
    db.user = null;
    await expect(cancelBooking(ID, "")).rejects.toThrow("NEXT_REDIRECT");
    expect(sendBookingCancellation).not.toHaveBeenCalled();
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
