// @vitest-environment node
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bookSlot,
  cancelBooking,
  listAvailableSlots,
  listUpcomingSessions,
} from "../lib/booking";

// DB-backed: exercises the real schema, RLS, unique index and the
// available_slots() definer function through supabase-js clients that act as
// authenticated (non-privileged) users. Setup/inspection uses a privileged pg
// connection.

function loadEnv(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env.local`);
  return line.slice(name.length + 1).trim();
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** HS256 JWT for a local-stack user; PostgREST maps it to the `authenticated` role. */
function signUserJwt(userId: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = createHmac("sha256", loadEnv("SUPABASE_JWT_SECRET"))
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function userClient(userId: string): SupabaseClient {
  return createClient(
    loadEnv("NEXT_PUBLIC_SUPABASE_URL"),
    loadEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${signUserJwt(userId)}` } },
    },
  );
}

// A fixed "now" far beyond any seeded slot, so only this file's slots are ever
// in the future relative to it.
const NOW = new Date("2090-06-15T12:00:00.000Z");
const at = (offsetMinutes: number) =>
  new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString();

const trainerId = randomUUID();
const clientA = randomUUID();
const clientB = randomUUID();

const slot = {
  open: randomUUID(), // future, free
  taken: randomUUID(), // future, booked by B via admin
  mine: randomUUID(), // future, booked by A via admin
  cancelMe: randomUUID(), // future, used for the cancel/free-up flow
  past: randomUUID(), // started an hour ago
  boundary: randomUUID(), // starts exactly at NOW
  other: randomUUID(), // future, contested by A and B in the concurrency test
  free: randomUUID(), // future, never booked by any test
};
const slotIds: string[] = Object.values(slot);

let admin: Client;
let a: SupabaseClient;
let b: SupabaseClient;

async function insertBooking(slotId: string, clientId: string, status = "booked") {
  const { rows } = await admin.query(
    "insert into public.bookings (slot_id, client_id, status, cancelled_at) values ($1, $2, $3, case when $3 = 'cancelled' then now() end) returning id",
    [slotId, clientId, status],
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  admin = new Client({ connectionString: loadEnv("SUPABASE_DB_URL") });
  await admin.connect();

  for (const [id, name, role] of [
    [trainerId, "Trainer", "trainer"],
    [clientA, "Client A", "client"],
    [clientB, "Client B", "client"],
  ] as const) {
    await admin.query(
      "insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)",
      [id, `${id}@example.test`],
    );
    await admin.query(
      "insert into public.profiles (id, full_name, role) values ($1, $2, $3)",
      [id, name, role],
    );
  }

  const slotRows: [string, string, number][] = [
    [slot.open, "Open", 60],
    [slot.taken, "Taken", 120],
    [slot.mine, "Mine", 180],
    [slot.cancelMe, "CancelMe", 240],
    [slot.past, "Past", -60],
    [slot.boundary, "Boundary", 0],
    [slot.other, "Other", 300],
    [slot.free, "Free", 400],
  ];
  for (const [id, location, offset] of slotRows) {
    await admin.query(
      "insert into public.slots (id, starts_at, ends_at, trainer_id, location) values ($1, $2, $3, $4, $5)",
      [id, at(offset), at(offset + 60), trainerId, location],
    );
  }

  a = userClient(clientA);
  b = userClient(clientB);
});

afterAll(async () => {
  if (!admin) return;
  await admin.query("delete from public.bookings where slot_id = any($1)", [slotIds]);
  await admin.query("delete from public.slots where id = any($1)", [slotIds]);
  await admin.query("delete from auth.users where id = any($1)", [
    [trainerId, clientA, clientB],
  ]);
  await admin.end();
});

const availableIds = async (db: SupabaseClient) =>
  (await listAvailableSlots(db, NOW)).map((s) => s.id).filter((id) => slotIds.includes(id));

describe("bookSlot", () => {
  it("books an open future slot", async () => {
    const res = await bookSlot(a, clientA, slot.open, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.booking).toMatchObject({
      slot_id: slot.open,
      client_id: clientA,
      status: "booked",
    });
    const { rows } = await admin.query(
      "select client_id, status from public.bookings where id = $1",
      [res.booking.id],
    );
    expect(rows).toEqual([{ client_id: clientA, status: "booked" }]);
    // Booked slot is no longer offered.
    expect(await availableIds(a)).not.toContain(slot.open);
  });

  it("rejects a slot that has already started (past)", async () => {
    expect(await bookSlot(a, clientA, slot.past, NOW)).toEqual({
      ok: false,
      reason: "past",
    });
    const { rowCount } = await admin.query(
      "select 1 from public.bookings where slot_id = $1",
      [slot.past],
    );
    expect(rowCount).toBe(0);
  });

  it("rejects a slot starting exactly now (strictly future only)", async () => {
    expect(await bookSlot(a, clientA, slot.boundary, NOW)).toEqual({
      ok: false,
      reason: "past",
    });
  });

  it("returns not-found for a slot that does not exist", async () => {
    expect(await bookSlot(a, clientA, randomUUID(), NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("returns taken when another client holds the slot (unique-index violation)", async () => {
    await insertBooking(slot.taken, clientB);
    // A cannot see B's booking under RLS, so only the unique index can stop this.
    expect(await bookSlot(a, clientA, slot.taken, NOW)).toEqual({
      ok: false,
      reason: "taken",
    });
    const { rows } = await admin.query(
      "select client_id from public.bookings where slot_id = $1 and status = 'booked'",
      [slot.taken],
    );
    expect(rows).toEqual([{ client_id: clientB }]);
  });

  it("returns taken for the loser of two concurrent bookings", async () => {
    const results = await Promise.all([
      bookSlot(a, clientA, slot.other, NOW),
      bookSlot(b, clientB, slot.other, NOW),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "taken" }]);
    const { rowCount } = await admin.query(
      "select 1 from public.bookings where slot_id = $1 and status = 'booked'",
      [slot.other],
    );
    expect(rowCount).toBe(1);
  });

  it("returns already-booked when the client already holds the slot", async () => {
    await insertBooking(slot.mine, clientA);
    expect(await bookSlot(a, clientA, slot.mine, NOW)).toEqual({
      ok: false,
      reason: "already-booked",
    });
    const { rowCount } = await admin.query(
      "select 1 from public.bookings where slot_id = $1",
      [slot.mine],
    );
    expect(rowCount).toBe(1);
  });

  it("refuses to book on behalf of another client (RLS)", async () => {
    await expect(bookSlot(a, clientB, slot.cancelMe, NOW)).rejects.toThrow();
    const { rowCount } = await admin.query(
      "select 1 from public.bookings where slot_id = $1",
      [slot.cancelMe],
    );
    expect(rowCount).toBe(0);
  });
});

describe("cancelBooking", () => {
  it("cancels before start and frees the slot", async () => {
    const booked = await bookSlot(a, clientA, slot.cancelMe, NOW);
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    expect(await availableIds(b)).not.toContain(slot.cancelMe);

    expect(await cancelBooking(a, clientA, booked.booking.id, NOW)).toEqual({
      ok: true,
    });
    const { rows } = await admin.query(
      "select status, cancelled_at from public.bookings where id = $1",
      [booked.booking.id],
    );
    expect(rows[0].status).toBe("cancelled");
    expect(rows[0].cancelled_at).not.toBeNull();

    expect(await availableIds(b)).toContain(slot.cancelMe);
    // ...and another client can now take it.
    expect((await bookSlot(b, clientB, slot.cancelMe, NOW)).ok).toBe(true);
  });

  it("returns already-cancelled for a cancelled booking", async () => {
    const id = await insertBooking(slot.cancelMe, clientA, "cancelled");
    expect(await cancelBooking(a, clientA, id, NOW)).toEqual({
      ok: false,
      reason: "already-cancelled",
    });
  });

  it("returns started once the slot has begun", async () => {
    const id = await insertBooking(slot.past, clientA);
    expect(await cancelBooking(a, clientA, id, NOW)).toEqual({
      ok: false,
      reason: "started",
    });
    const { rows } = await admin.query(
      "select status from public.bookings where id = $1",
      [id],
    );
    expect(rows[0].status).toBe("booked");
  });

  it("treats starts_at === now as started (not cancellable) and not available", async () => {
    const id = await insertBooking(slot.boundary, clientA);
    expect(await cancelBooking(a, clientA, id, NOW)).toEqual({
      ok: false,
      reason: "started",
    });
    expect(await availableIds(a)).not.toContain(slot.boundary);
    expect(await availableIds(b)).not.toContain(slot.boundary);
  });

  it("returns not-found for a booking that does not exist", async () => {
    expect(await cancelBooking(a, clientA, randomUUID(), NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("returns not-found for another client's booking and leaves it intact", async () => {
    const { rows: other } = await admin.query(
      "select id from public.bookings where slot_id = $1 and client_id = $2 and status = 'booked'",
      [slot.taken, clientB],
    );
    expect(other).toHaveLength(1);
    expect(await cancelBooking(a, clientA, other[0].id, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
    const { rows } = await admin.query(
      "select status from public.bookings where id = $1",
      [other[0].id],
    );
    expect(rows[0].status).toBe("booked");
  });

  it("returns not-found when the caller passes someone else's clientId", async () => {
    // Authenticated as A but claiming to be B: the booking must still not match.
    const { rows } = await admin.query(
      "select id from public.bookings where slot_id = $1 and client_id = $2 and status = 'booked'",
      [slot.mine, clientA],
    );
    expect(await cancelBooking(a, clientB, rows[0].id, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("listAvailableSlots", () => {
  it("lists only future, unbooked slots in ascending order", async () => {
    const list = await listAvailableSlots(a, NOW);
    const mine = list.filter((s) => slotIds.includes(s.id));
    // Fresh state for these assertions: everything still available is future.
    for (const s of mine) expect(new Date(s.starts_at).getTime()).toBeGreaterThan(NOW.getTime());
    const times = list.map((s) => new Date(s.starts_at).getTime());
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(mine.map((s) => s.id)).not.toContain(slot.past);
    expect(mine.map((s) => s.id)).not.toContain(slot.boundary);
    expect(mine.map((s) => s.id)).not.toContain(slot.taken);
    expect(mine.map((s) => s.id)).not.toContain(slot.open);
    expect(mine.map((s) => s.id)).toContain(slot.free);
  });

  it("exposes slot fields only, never who booked", async () => {
    const list = (await listAvailableSlots(a, NOW)).filter(
      (s) => s.id === slot.free,
    );
    expect(list).toHaveLength(1);
    for (const s of list) {
      expect(Object.keys(s).sort()).toEqual(
        ["created_at", "ends_at", "id", "location", "starts_at", "trainer_id"].sort(),
      );
    }
  });

  it("is not callable by anon", async () => {
    const anon = createClient(
      loadEnv("NEXT_PUBLIC_SUPABASE_URL"),
      loadEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { auth: { persistSession: false } },
    );
    await expect(listAvailableSlots(anon, NOW)).rejects.toThrow();
  });
});

describe("listUpcomingSessions", () => {
  it("returns only the client's booked, future sessions in ascending order", async () => {
    // A currently holds: slot.open (+60), slot.mine (+180); slot.past/boundary
    // bookings are started; slot.cancelMe was cancelled by A.
    const sessions = await listUpcomingSessions(a, clientA, NOW);
    // slot.other is the concurrent-race slot; its winner is nondeterministic.
    const mine = sessions.filter(
      (s) => slotIds.includes(s.slot_id) && s.slot_id !== slot.other,
    );
    expect(mine.map((s) => s.slot_id)).toEqual([slot.open, slot.mine]);
    for (const s of mine) {
      expect(new Date(s.starts_at).getTime()).toBeGreaterThan(NOW.getTime());
      expect(s).toMatchObject({ trainer_id: trainerId });
      expect(s.ends_at).toBeTruthy();
      expect(s.location).toBeTruthy();
      expect(s.id).toBeTruthy();
    }
    // Never includes another client's sessions.
    expect(mine.map((s) => s.slot_id)).not.toContain(slot.taken);
  });

  it("does not include cancelled bookings", async () => {
    const sessions = await listUpcomingSessions(a, clientA, NOW);
    expect(sessions.map((s) => s.slot_id)).not.toContain(slot.cancelMe);
  });
});
