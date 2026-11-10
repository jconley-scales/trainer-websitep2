// @vitest-environment node
/**
 * Booking spam guards, against the real local Supabase (`npx supabase start`).
 * Skipped when it isn't running. Always local: the URL is pinned here so these
 * tests can never write to the hosted project, whatever the env files say.
 */
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Supabase's well-known local-dev defaults (`npx supabase status`), not secrets.
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LOCAL_ANON_KEY;

const { notifyTrainerOfBooking } = vi.hoisted(() => ({ notifyTrainerOfBooking: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyTrainerOfBooking }));
// Outside a request, run after() work straight away so the email is observable.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

import { getTakenTimes, submitBooking } from "@/app/(marketing)/book/actions";
import { availableDays, clashesWithTaken, type AvailableSlot } from "@/lib/booking-availability";
import { SITE } from "@/lib/site";

const admin = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });

const running = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: LOCAL_ANON_KEY } })
  .then((r) => r.ok)
  .catch(() => false);

const TEST_DOMAIN = "guards.example.test";
/** Marks the admin bookings these tests add (they have no email to clean up by). */
const TRAINER_ADDED = "[guards-admin-booking]";
const email = (who: string) => `${who}-${Date.now()}@${TEST_DOMAIN}`;

/** Future slots nobody holds yet. */
async function freeSlots(count: number): Promise<AvailableSlot[]> {
  const taken = await getTakenTimes();
  const free = availableDays(new Date(), "in-person")
    .flatMap((d) => d.slots)
    .filter((s) => !clashesWithTaken(s, taken));
  if (free.length < count) throw new Error(`Need ${count} free slots, found ${free.length}`);
  return free.slice(0, count);
}

function booking(slot: AvailableSlot, who: string, extra: { website?: string } = {}) {
  return {
    name: "Pat Example",
    email: who,
    phone: "",
    note: "",
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    sessionType: "one-on-one" as const,
    ...extra,
  };
}

async function isTaken(slot: AvailableSlot) {
  return clashesWithTaken(slot, await getTakenTimes());
}

describe.skipIf(!running)("booking spam guards (local Supabase)", () => {
  beforeAll(() => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(LOCAL_URL);
  });

  afterEach(async () => {
    notifyTrainerOfBooking.mockReset();
    await admin.from("booking_requests").delete().ilike("email", `%@${TEST_DOMAIN}%`);
    await admin.from("booking_requests").delete().like("name", `%${TRAINER_ADDED}%`);
  });

  it("tells a bot its request went through, but saves nothing and emails nobody", async () => {
    const [slot] = await freeSlots(1);

    const result = await submitBooking(booking(slot, email("bot"), { website: "http://spam.example" }));

    expect(result).toEqual({ ok: true });
    expect(await isTaken(slot)).toBe(false);
    expect(notifyTrainerOfBooking).not.toHaveBeenCalled();
  });

  it("refuses a fourth waiting request from one email, even posted straight to the database", async () => {
    const slots = await freeSlots(4);
    const who = email("squatter");
    for (const slot of slots.slice(0, 3)) {
      expect(await submitBooking(booking(slot, who))).toEqual({ ok: true });
    }

    const { error } = await anon.from("booking_requests").insert({
      name: "Pat Example",
      email: ` ${who.toUpperCase()} `,
      starts_at: slots[3].startsAt,
      ends_at: slots[3].endsAt,
      session_type: "partner",
    });

    expect(error?.code).toBe("PF001");
    expect(await isTaken(slots[3])).toBe(false);
  });

  it("warmly tells a visitor over the limit what to do next, and emails nobody about it", async () => {
    const slots = await freeSlots(4);
    const who = email("keen");
    for (const slot of slots.slice(0, 3)) await submitBooking(booking(slot, who));
    notifyTrainerOfBooking.mockReset();

    const result = await submitBooking(booking(slots[3], who));

    expect(result).toEqual({
      ok: false,
      error: `You already have a few requests waiting. ${SITE.trainerFirstName} will be in touch soon, or send a message if you need to change one.`,
      limitReached: true,
    });
    expect(notifyTrainerOfBooking).not.toHaveBeenCalled();
  });

  it("doesn't count cancelled or past sessions, so regular clients can keep booking", async () => {
    const slots = await freeSlots(4);
    const who = email("regular");
    const { error: seedError } = await admin.from("booking_requests").insert([
      { name: "Pat Example", email: who, starts_at: "2020-01-02T13:00:00Z", ends_at: "2020-01-02T14:00:00Z", status: "new", session_type: "one-on-one" },
      { name: "Pat Example", email: who, starts_at: slots[3].startsAt, ends_at: slots[3].endsAt, status: "cancelled", session_type: "one-on-one" },
    ]);
    expect(seedError).toBeNull();

    for (const slot of slots.slice(0, 3)) {
      expect(await submitBooking(booking(slot, who))).toEqual({ ok: true });
    }
    expect(notifyTrainerOfBooking).toHaveBeenCalledTimes(3);
  });

  it("still says a time was just taken when someone else holds it", async () => {
    const [slot] = await freeSlots(1);
    expect(await submitBooking(booking(slot, email("first")))).toEqual({ ok: true });

    const result = await submitBooking(booking(slot, email("second")));

    expect(result).toEqual({
      ok: false,
      error: "Sorry, someone has just booked that time. Please choose another.",
      taken: true,
    });
  });

  it("hides a slot that an admin booking at another time overlaps, and refuses a request for it", async () => {
    const [slot] = await freeSlots(1);
    // The trainer's phone booking starts 15 minutes into the slot.
    const start = Date.parse(slot.startsAt) + 15 * 60_000;
    const { error: seedError } = await admin.from("booking_requests").insert({
      name: `Pat ${TRAINER_ADDED}`,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + 45 * 60_000).toISOString(),
      status: "confirmed",
      source: "admin",
      session_type: "one-on-one",
    });
    expect(seedError).toBeNull();
    expect(await isTaken(slot)).toBe(true);

    const result = await submitBooking(booking(slot, email("overlap")));

    expect(result).toEqual({
      ok: false,
      error: "Sorry, someone has just booked that time. Please choose another.",
      taken: true,
    });
    expect(notifyTrainerOfBooking).not.toHaveBeenCalled();
  });
});
