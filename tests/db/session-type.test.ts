// @vitest-environment node
/**
 * The session type a visitor chooses on /book (1-on-1 or Partner, in person or
 * virtual), against the
 * real local Supabase (`npx supabase start`). Skipped when it isn't running.
 * Pinned to 127.0.0.1, like the other DB tests, so it never touches the hosted
 * project.
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

import { getTakenTimes, submitBooking, type BookingInput } from "@/app/(marketing)/book/actions";
import { availableDays, clashesWithTaken, type AvailableSlot } from "@/lib/booking-availability";
import type { SessionFormat } from "@/lib/session-types";

const noSession = { auth: { persistSession: false } };
const service = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, noSession);
const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, noSession);

const running = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: LOCAL_ANON_KEY } })
  .then((r) => r.ok)
  .catch(() => false);

const TEST_DOMAIN = "session-type.example.test";
const email = (who: string) => `${who}-${Date.now()}-${Math.random().toString(36).slice(2)}@${TEST_DOMAIN}`;
const MISSING = "Please choose the kind of session you would like.";

/**
 * Future slots nobody holds yet, from the far end of the schedule, so they
 * never collide with booking-guards.test.ts (which takes the soonest) when
 * the files run in parallel.
 */
async function freeSlots(count: number, format: SessionFormat = "in-person"): Promise<AvailableSlot[]> {
  const taken = await getTakenTimes();
  const free = availableDays(new Date(), format)
    .flatMap((d) => d.slots)
    .filter((s) => !clashesWithTaken(s, taken));
  if (free.length < count) throw new Error(`Need ${count} free slots, found ${free.length}`);
  return free.slice(-count);
}

/** A time years out, on an odd minute, that no real slot or other test will hold. */
function farTime() {
  const start = Date.UTC(2035, 0, 1, 15, 45) + Math.floor(Math.random() * 20_000) * 86_400_000;
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(start + 3_600_000).toISOString() };
}

function request(slot: AvailableSlot, who: string, sessionType: unknown): BookingInput {
  return {
    name: "Pat Example",
    email: who,
    phone: "",
    note: "",
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    sessionType: sessionType as BookingInput["sessionType"],
  };
}

async function savedTypes(who: string) {
  const { data, error } = await service.from("booking_requests").select("session_type").eq("email", who);
  expect(error).toBeNull();
  return (data ?? []).map((row) => row.session_type);
}

describe.skipIf(!running)("session type (local Supabase)", () => {
  beforeAll(() => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(LOCAL_URL);
  });

  afterEach(async () => {
    notifyTrainerOfBooking.mockReset();
    await service.from("booking_requests").delete().ilike("email", `%@${TEST_DOMAIN}`);
  });

  it.each([
    ["one-on-one", "in-person"],
    ["partner", "in-person"],
    ["virtual-one-on-one", "virtual"],
    ["virtual-partner", "virtual"],
  ] as const)("saves a %s request with its type and tells the trainer", async (type, format) => {
    const [slot] = await freeSlots(1, format);
    const who = email(type);

    expect(await submitBooking(request(slot, who, type))).toEqual({ ok: true });

    expect(await savedTypes(who)).toEqual([type]);
    expect(notifyTrainerOfBooking).toHaveBeenCalledWith(expect.objectContaining({ sessionType: type }));
  });

  it.each([undefined, "", "pair", "Partner", 1])(
    "refuses a request posted with session type %j, saving and sending nothing",
    async (type) => {
      const [slot] = await freeSlots(1);
      const who = email("no-type");

      expect(await submitBooking(request(slot, who, type))).toEqual({ ok: false, error: MISSING });

      expect(await savedTypes(who)).toEqual([]);
      expect(notifyTrainerOfBooking).not.toHaveBeenCalled();
    },
  );

  it("refuses a website request with no type or an unknown one, even posted straight to the database", async () => {
    const row = { name: "Pat Example", ...farTime() };

    const missing = await anon.from("booking_requests").insert({ ...row, email: email("direct") });
    expect(missing.error).not.toBeNull();
    const unknown = await anon.from("booking_requests").insert({ ...row, email: email("direct"), session_type: "pair" });
    expect(unknown.error).not.toBeNull();
    // Not even the service role may store an unknown type.
    const privileged = await service.from("booking_requests").insert({ ...row, email: email("direct"), session_type: "group" });
    expect(privileged.error?.code).toBe("23514");

    const ok = await anon.from("booking_requests").insert({ ...row, email: email("direct"), session_type: "partner" });
    expect(ok.error).toBeNull();
    const virtual = await anon
      .from("booking_requests")
      .insert({ name: "Pat Example", ...farTime(), email: email("direct"), session_type: "virtual-partner" });
    expect(virtual.error).toBeNull();
  });

  it("refuses a virtual request at an in-person time, and an in-person one at a virtual time", async () => {
    const [inPerson] = await freeSlots(1, "in-person");
    const [virtual] = await freeSlots(1, "virtual");
    const virtualAtInPerson = await submitBooking(request(inPerson, email("wrong-a"), "virtual-one-on-one"));
    const inPersonAtVirtual = await submitBooking(request(virtual, email("wrong-b"), "partner"));

    expect(virtualAtInPerson).toMatchObject({ ok: false, taken: true });
    expect(inPersonAtVirtual).toMatchObject({ ok: false, taken: true });
    expect(notifyTrainerOfBooking).not.toHaveBeenCalled();
  });

  it("refuses an in-person time that would leave the trainer less than the break after a virtual session", async () => {
    const [virtual] = await freeSlots(1, "virtual");
    expect(await submitBooking(request(virtual, email("virtual"), "virtual-one-on-one"))).toEqual({ ok: true });

    // The same day's in-person slots that overlap it or sit within 45 minutes of it.
    const near = availableDays(new Date(), "in-person")
      .flatMap((d) => d.slots)
      .filter((s) => clashesWithTaken(s, [{ start: Date.parse(virtual.startsAt), end: Date.parse(virtual.endsAt) }]));
    expect(near.length).toBeGreaterThan(0);
    for (const slot of near) {
      expect(await submitBooking(request(slot, email("near"), "one-on-one"))).toMatchObject({ ok: false, taken: true });
    }
  });

  it("keeps rows with no type recorded, and still lets them be confirmed", async () => {
    const who = email("old");
    // A booking made before session types: no type at all.
    const { data, error } = await service
      .from("booking_requests")
      .insert({ name: "Pat Example", email: who, ...farTime(), created_at: "2025-06-01T00:00:00Z" })
      .select("id, session_type")
      .single();
    expect(error).toBeNull();
    expect(data!.session_type).toBeNull();

    const confirm = await service.from("booking_requests").update({ status: "confirmed" }).eq("id", data!.id);
    expect(confirm.error).toBeNull();
  });

  it("holds one booking per time whatever the type", async () => {
    const [slot] = await freeSlots(1);
    expect(await submitBooking(request(slot, email("first"), "one-on-one"))).toEqual({ ok: true });

    const second = await submitBooking(request(slot, email("second"), "partner"));

    expect(second).toMatchObject({ ok: false, taken: true });
  });

  it("counts both types toward the same three waiting requests per email", async () => {
    const slots = await freeSlots(4);
    const who = email("mixed");
    const types = ["one-on-one", "partner", "partner"] as const;
    for (const [i, type] of types.entries()) {
      expect(await submitBooking(request(slots[i], who, type))).toEqual({ ok: true });
    }

    const fourth = await submitBooking(request(slots[3], who, "one-on-one"));

    expect(fourth).toMatchObject({ ok: false, limitReached: true });
  });
});
