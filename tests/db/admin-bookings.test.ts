// @vitest-environment node
/**
 * Admin bookings (bookings the trainer adds at /admin for clients who arranged
 * them by phone or text), against the real local Supabase (`npx supabase
 * start`). Skipped when it isn't running. Pinned to 127.0.0.1, like the other
 * DB tests, so it can never touch the hosted project.
 *
 * Checks the database rules themselves (row level security, the email rule,
 * the per-email cap, the one-live-booking-per-time index, taken times), so they
 * hold even for requests posted straight to the database.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// Supabase's well-known local-dev defaults (`npx supabase status`), not secrets.
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const running = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: LOCAL_ANON_KEY } })
  .then((r) => r.ok)
  .catch(() => false);

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, noSession);
const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, noSession);

/** Every row these tests add has this in its name, so cleanup can find rows without an email. */
const MARK = "[db-admin-test]";
const TEST_DOMAIN = "admin-bookings.example.test";
const clientEmail = (who: string) => `${who}-${randomUUID()}@${TEST_DOMAIN}`;

const MINUTE = 60_000;

/**
 * A start time years out, on an odd minute, that no real slot or other test
 * will hold (a random day, so reruns never collide on the one-live-per-time index).
 */
function freeTime(minutes = 60) {
  const start = new Date(
    Date.UTC(2034, 0, 1, 15, 15) + Math.floor(Math.random() * 20_000) * 86_400_000,
  );
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + minutes * MINUTE).toISOString() };
}

/** Signs a fresh user in with a password and returns a client acting as them. */
async function signedInUser(isAdmin: boolean): Promise<{ db: SupabaseClient; email: string; id: string }> {
  const email = `db-${isAdmin ? "admin" : "member"}-${randomUUID()}@${TEST_DOMAIN}`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  if (isAdmin) {
    const { error: adminError } = await service.from("admins").insert({ email });
    if (adminError) throw adminError;
  }
  const db = createClient(LOCAL_URL, LOCAL_ANON_KEY, noSession);
  const { error: signInError } = await db.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { db, email, id: data.user.id };
}

/** What the public calendar is told is taken between two instants: times only, as epoch ms. */
async function takenBetween(from: number, to: number): Promise<{ start: number; end: number }[]> {
  const { data, error } = await anon.rpc("taken_booking_times", {
    p_from: new Date(from).toISOString(),
    p_to: new Date(to).toISOString(),
  });
  expect(error).toBeNull();
  return (data as Record<string, string>[]).map((row) => {
    // Only the times: never who booked.
    expect(Object.keys(row).sort()).toEqual(["ends_at", "starts_at"]);
    return { start: Date.parse(row.starts_at), end: Date.parse(row.ends_at) };
  });
}

describe.skipIf(!running)("admin bookings (local Supabase)", () => {
  let trainer: Awaited<ReturnType<typeof signedInUser>>;
  let member: Awaited<ReturnType<typeof signedInUser>>;

  beforeAll(async () => {
    trainer = await signedInUser(true);
    member = await signedInUser(false);
  });

  afterEach(async () => {
    await service.from("booking_requests").delete().like("name", `%${MARK}%`);
  });

  afterAll(async () => {
    for (const u of [trainer, member]) {
      if (!u) continue;
      await service.from("admins").delete().eq("email", u.email);
      await service.auth.admin.deleteUser(u.id);
    }
  });

  it("lets the trainer add a confirmed booking at any time, for any length, with only a name", async () => {
    const time = freeTime(45);
    const { data, error } = await trainer.db
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, ...time, status: "confirmed", source: "admin", session_type: "one-on-one" })
      .select("status, source, email");

    expect(error).toBeNull();
    expect(data).toEqual([{ status: "confirmed", source: "admin", email: null }]);
  });

  it("shows an admin booking's whole time, start to end, as taken on the public calendar", async () => {
    const time = freeTime(45);
    await trainer.db.from("booking_requests").insert({ name: `Pat ${MARK}`, ...time, status: "confirmed", source: "admin", session_type: "one-on-one" });
    const start = Date.parse(time.starts_at);
    const end = Date.parse(time.ends_at);

    expect(await takenBetween(start - MINUTE, start + MINUTE)).toEqual([{ start, end }]);
  });

  it("includes a booking that starts before the window but runs into it", async () => {
    const time = freeTime(45);
    await trainer.db.from("booking_requests").insert({ name: `Pat ${MARK}`, ...time, status: "confirmed", source: "admin", session_type: "one-on-one" });
    const start = Date.parse(time.starts_at);
    const end = Date.parse(time.ends_at);

    expect(await takenBetween(start + 30 * MINUTE, start + 120 * MINUTE)).toEqual([{ start, end }]);
    expect(await takenBetween(end, end + 60 * MINUTE)).toEqual([]);
  });

  it("still rejects a website booking with no email, even from the trainer", async () => {
    const { error: fromVisitor } = await anon
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, ...freeTime(), session_type: "one-on-one" });
    const { error: fromTrainer } = await trainer.db
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, ...freeTime(), source: "website", session_type: "one-on-one" });

    expect(fromVisitor?.code).toBe("23514");
    expect(fromTrainer?.code).toBe("23514");
  });

  it("marks existing and visitor bookings as from the website", async () => {
    const time = freeTime();
    const { error } = await anon
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, email: clientEmail("visitor"), ...time, session_type: "one-on-one" });
    expect(error).toBeNull();

    const { data } = await service.from("booking_requests").select("source, status").eq("starts_at", time.starts_at);
    expect(data).toEqual([{ source: "website", status: "new" }]);
  });

  it("does not let a visitor add an admin booking or a confirmed one", async () => {
    const asAdmin = await anon
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, email: clientEmail("sneaky"), ...freeTime(), source: "admin" });
    const confirmed = await anon
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, email: clientEmail("sneaky"), ...freeTime(), status: "confirmed" });

    expect(asAdmin.error?.code).toBe("42501");
    expect(confirmed.error?.code).toBe("42501");
  });

  it("does not let a signed-in non-admin add an admin booking, or read any booking", async () => {
    const { error } = await member.db
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, ...freeTime(), status: "confirmed", source: "admin", session_type: "one-on-one" });
    expect(error?.code).toBe("42501");

    await trainer.db.from("booking_requests").insert({ name: `Pat ${MARK}`, ...freeTime(), status: "confirmed", source: "admin", session_type: "one-on-one" });
    const { data: memberRows } = await member.db.from("booking_requests").select("id").like("name", `%${MARK}%`);
    const { data: anonRows } = await anon.from("booking_requests").select("id").like("name", `%${MARK}%`);
    expect(memberRows ?? []).toEqual([]);
    expect(anonRows ?? []).toEqual([]);
  });

  it("does not cap admin bookings per email, nor count them against the client's own requests", async () => {
    const who = clientEmail("regular");
    for (let i = 0; i < 4; i++) {
      const { error } = await trainer.db
        .from("booking_requests")
        .insert({ name: `Pat ${MARK}`, email: who, ...freeTime(), status: "confirmed", source: "admin", session_type: "one-on-one" });
      expect(error).toBeNull();
    }

    for (let i = 0; i < 3; i++) {
      const { error } = await anon.from("booking_requests").insert({ name: `Pat ${MARK}`, email: who, ...freeTime(), session_type: "one-on-one" });
      expect(error).toBeNull();
    }
    const { error: fourth } = await anon.from("booking_requests").insert({ name: `Pat ${MARK}`, email: who, ...freeTime(), session_type: "one-on-one" });
    expect(fourth?.code).toBe("PF001");
  });

  it("requires a known session type on every new booking, from the trainer or even the service role", async () => {
    const admin = { name: `Pat ${MARK}`, status: "confirmed", source: "admin" };
    const none = await trainer.db.from("booking_requests").insert({ ...admin, ...freeTime() });
    const unknown = await trainer.db.from("booking_requests").insert({ ...admin, ...freeTime(), session_type: "group" });
    const privileged = await service.from("booking_requests").insert({ ...admin, ...freeTime() });

    expect(none.error?.code).toBe("23514");
    expect(unknown.error?.code).toBe("23514");
    expect(privileged.error?.code).toBe("23514");

    const partner = await trainer.db
      .from("booking_requests")
      .insert({ ...admin, ...freeTime(), session_type: "partner" })
      .select("session_type");
    expect(partner.error).toBeNull();
    expect(partner.data).toEqual([{ session_type: "partner" }]);
  });

  it("does not let the trainer or a visitor backdate a new booking to skip the session type", async () => {
    const backdated = { created_at: "2025-01-01T00:00:00Z" };
    const fromTrainer = await trainer.db
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, ...freeTime(), status: "confirmed", source: "admin", ...backdated });
    const fromVisitor = await anon
      .from("booking_requests")
      .insert({ name: `Pat ${MARK}`, email: clientEmail("old"), ...freeTime(), session_type: "partner", ...backdated });

    expect(fromTrainer.error?.code).toBe("42501");
    expect(fromVisitor.error?.code).toBe("42501");
  });

  it("blocks an admin booking at the exact start time of a live booking", async () => {
    const time = freeTime();
    await anon.from("booking_requests").insert({ name: `Pat ${MARK}`, email: clientEmail("first"), ...time, session_type: "one-on-one" });

    const { error } = await trainer.db
      .from("booking_requests")
      .insert({ name: `Sam ${MARK}`, ...time, status: "confirmed", source: "admin", session_type: "one-on-one" });

    expect(error?.code).toBe("23505");
  });
});

describe.skipIf(!running)("editing bookings (local Supabase)", () => {
  let trainer: Awaited<ReturnType<typeof signedInUser>>;
  let member: Awaited<ReturnType<typeof signedInUser>>;

  beforeAll(async () => {
    trainer = await signedInUser(true);
    member = await signedInUser(false);
  });

  afterEach(async () => {
    await service.from("booking_requests").delete().like("name", `%${MARK}%`);
  });

  afterAll(async () => {
    for (const u of [trainer, member]) {
      if (!u) continue;
      await service.from("admins").delete().eq("email", u.email);
      await service.auth.admin.deleteUser(u.id);
    }
  });

  /** A website request (as a visitor makes it), returning its id. Extra columns are set by the service role. */
  async function websiteBooking(extra: Record<string, unknown> = {}, time = freeTime()) {
    const { data, error } = await service
      .from("booking_requests")
      .insert({ name: `Jordan ${MARK}`, email: clientEmail("jordan"), ...time, session_type: "one-on-one", ...extra })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("no row");
    return data.id as string;
  }

  async function row(id: string) {
    const { data } = await service
      .from("booking_requests")
      .select("name, email, phone, note, starts_at, ends_at, status, source, updated_at, session_type")
      .eq("id", id)
      .single();
    return data!;
  }

  it("lets the trainer change a booking's details and time, and records when it was edited", async () => {
    const id = await websiteBooking();
    expect((await row(id)).updated_at).toBeNull();
    const moved = freeTime(45);

    const { data, error } = await trainer.db
      .from("booking_requests")
      .update({
        name: `Jordan Tester ${MARK}`,
        email: clientEmail("fixed"),
        phone: "555 010 2030",
        note: "Bad left knee.",
        ...moved,
      })
      .eq("id", id)
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const after = await row(id);
    expect(after).toMatchObject({ phone: "555 010 2030", note: "Bad left knee.", source: "website" });
    expect(Date.parse(after.starts_at)).toBe(Date.parse(moved.starts_at));
    expect(after.updated_at).not.toBeNull();
  });

  it("lets the trainer change only a booking's session type, which marks it edited", async () => {
    const id = await websiteBooking();

    const { error } = await trainer.db.from("booking_requests").update({ session_type: "virtual-partner" }).eq("id", id);

    expect(error).toBeNull();
    const after = await row(id);
    expect(after.session_type).toBe("virtual-partner");
    expect(after.updated_at).not.toBeNull();
  });

  it("does not let a booking's session type be cleared or set to an unknown one", async () => {
    const id = await websiteBooking();
    const cleared = await trainer.db.from("booking_requests").update({ session_type: null }).eq("id", id);
    const unknown = await trainer.db.from("booking_requests").update({ session_type: "group" }).eq("id", id);

    expect(cleared.error?.code).toBe("23514");
    expect(unknown.error?.code).toBe("23514");
    expect(await row(id)).toMatchObject({ session_type: "one-on-one", updated_at: null });
  });

  it("lets a booking from before session types stay without one when edited, or be given one that then stays", async () => {
    const id = await websiteBooking({ session_type: null, created_at: "2025-06-01T00:00:00Z" });

    const edit = await trainer.db.from("booking_requests").update({ note: "Bad left knee." }).eq("id", id);
    expect(edit.error).toBeNull();
    expect(await row(id)).toMatchObject({ note: "Bad left knee.", session_type: null });

    const given = await trainer.db.from("booking_requests").update({ session_type: "partner" }).eq("id", id);
    expect(given.error).toBeNull();
    expect((await row(id)).session_type).toBe("partner");

    const cleared = await trainer.db.from("booking_requests").update({ session_type: null }).eq("id", id);
    expect(cleared.error?.code).toBe("23514");
    expect((await row(id)).session_type).toBe("partner");
  });

  it("does not let a signed-in non-admin or a visitor change a booking's session type", async () => {
    const id = await websiteBooking();

    const fromMember = await member.db.from("booking_requests").update({ session_type: "partner" }).eq("id", id).select("id");
    const fromVisitor = await anon.from("booking_requests").update({ session_type: "partner" }).eq("id", id).select("id");

    expect(fromMember.data ?? []).toEqual([]);
    expect(fromVisitor.error?.code ?? "none").not.toBe("none");
    expect((await row(id)).session_type).toBe("one-on-one");
  });

  it("does not mark a booking edited when only its status changes", async () => {
    const id = await websiteBooking();
    const { error } = await trainer.db.from("booking_requests").update({ status: "confirmed" }).eq("id", id);
    expect(error).toBeNull();
    expect(await row(id)).toMatchObject({ status: "confirmed", updated_at: null });
  });

  it("does not let the trainer change where a booking came from, or when it was edited", async () => {
    const id = await websiteBooking();
    const source = await trainer.db.from("booking_requests").update({ source: "admin" }).eq("id", id);
    const stamp = await trainer.db
      .from("booking_requests")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    expect(source.error?.code).toBe("42501");
    expect(stamp.error?.code).toBe("42501");
    expect(await row(id)).toMatchObject({ source: "website", updated_at: null });
  });

  it("does not let a signed-in non-admin or a visitor edit any booking", async () => {
    const id = await websiteBooking();
    const before = await row(id);

    const fromMember = await member.db.from("booking_requests").update({ name: `Hacked ${MARK}` }).eq("id", id).select("id");
    const fromVisitor = await anon.from("booking_requests").update({ name: `Hacked ${MARK}` }).eq("id", id).select("id");

    expect(fromMember.data ?? []).toEqual([]);
    expect(fromVisitor.error?.code ?? "none").not.toBe("none");
    expect(await row(id)).toEqual(before);
  });

  it("still needs an email on a website booking", async () => {
    const id = await websiteBooking();
    const { error } = await trainer.db.from("booking_requests").update({ email: null }).eq("id", id);
    expect(error?.code).toBe("23514");
  });

  it("does not let the per-email cap block correcting an email onto a client who already has three requests", async () => {
    const who = clientEmail("regular");
    for (let i = 0; i < 3; i++) {
      const { error } = await anon.from("booking_requests").insert({ name: `Pat ${MARK}`, email: who, ...freeTime(), session_type: "one-on-one" });
      expect(error).toBeNull();
    }
    const id = await websiteBooking();

    const { error } = await trainer.db.from("booking_requests").update({ email: who }).eq("id", id);

    expect(error).toBeNull();
    expect((await row(id)).email).toBe(who);
  });

  it("blocks moving a booking onto the exact start of another live booking", async () => {
    const taken = freeTime();
    await websiteBooking({}, taken);
    const id = await websiteBooking();

    const { error } = await trainer.db.from("booking_requests").update(taken).eq("id", id);
    expect(error?.code).toBe("23505");
  });

  it("keeps cancelled and past bookings read-only, though a cancelled one can still be reopened", async () => {
    const cancelled = await websiteBooking({ status: "cancelled" });
    const edit = await trainer.db.from("booking_requests").update({ note: "changed" }).eq("id", cancelled);
    expect(edit.error?.code).toBe("PF002");
    const retype = await trainer.db.from("booking_requests").update({ session_type: "partner" }).eq("id", cancelled);
    expect(retype.error?.code).toBe("PF002");

    const reopen = await trainer.db.from("booking_requests").update({ status: "new" }).eq("id", cancelled);
    expect(reopen.error).toBeNull();

    const start = Date.now() - 3 * 86_400_000 - Math.floor(Math.random() * 1_000_000) * 1000;
    const past = await websiteBooking({}, {
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + 60 * MINUTE).toISOString(),
    });
    const pastEdit = await trainer.db.from("booking_requests").update({ note: "changed" }).eq("id", past);
    expect(pastEdit.error?.code).toBe("PF002");
    const pastRetype = await trainer.db.from("booking_requests").update({ session_type: "partner" }).eq("id", past);
    expect(pastRetype.error?.code).toBe("PF002");
    expect(await row(past)).toMatchObject({ note: null, session_type: "one-on-one" });
  });
});
