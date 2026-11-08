import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendBookingConfirmation, db } = vi.hoisted(() => {
  /**
   * A stand-in for the Supabase query builder: every call chains, and awaiting
   * the chain gives `db.result`. `db.calls` records the chain for assertions.
   */
  const db = {
    result: { data: [] as unknown[] | null, error: null as { code?: string } | null },
    user: { id: "u1" } as { id: string } | null,
    calls: [] as [string, unknown[]][],
  };
  return { sendBookingConfirmation: vi.fn(), db };
});

vi.mock("@/lib/notify", () => ({ sendBookingConfirmation }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "update", "eq", "select"]) {
      chain[method] = (...args: unknown[]) => {
        db.calls.push([method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(db.result);
    // Only the query chain is awaitable; the client itself must not be.
    return { from: chain.from, auth: { getUser: async () => ({ data: { user: db.user } }) } };
  },
}));

import { confirmBooking, setBookingStatus } from "@/app/admin/actions";

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

describe("setBookingStatus", () => {
  it("reopens a booking without emailing anyone", async () => {
    const result = await setBookingStatus(ID, "new");
    expect(result).toEqual({ ok: true });
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("no longer confirms: confirming always goes through confirmBooking and its email", async () => {
    const result = await setBookingStatus(ID, "confirmed");
    expect(result).toMatchObject({ ok: false });
    expect(db.calls).toEqual([]);
  });
});
