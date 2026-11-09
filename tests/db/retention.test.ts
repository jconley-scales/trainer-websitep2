// @vitest-environment node
/**
 * The nightly retention job (`delete_expired_booking_requests`, migrations
 * 0005/0007), against the real local Supabase database (`npx supabase start`).
 * Skipped when it isn't running. Pinned to 127.0.0.1 so it can never touch the
 * hosted project.
 *
 * Each test runs in a transaction that is rolled back, so nothing it adds or
 * the job deletes is kept. Bookings with no email are admin bookings (only the
 * trainer may leave email out, migration 0008).
 */
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Supabase's well-known local-dev database (`npx supabase status`), not a secret.
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const running = await (async () => {
  const probe = new Client({ connectionString: LOCAL_DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    await probe.end();
    return true;
  } catch {
    return false;
  }
})();

let db: Client;

let seeded = 0;

/**
 * Adds a confirmed booking whose session started about `ago` before now (a
 * Postgres interval). Each one is a few minutes apart and on an odd second, so
 * none clash with each other or with real slots on the one-live-per-time index.
 */
async function bookingFrom(ago: string, who: { email?: string; phone?: string } = {}) {
  seeded += 1;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.booking_requests (name, email, phone, starts_at, ends_at, status, source)
     select 'Pat Example', $1::text, $2, t, t + interval '1 hour', 'confirmed',
       case when $1::text is null then 'admin' else 'website' end
     from (select now() - $3::interval + make_interval(mins => $4, secs => 7) as t) s
     returning id`,
    [who.email ?? null, who.phone ?? null, ago, seeded],
  );
  return rows[0].id;
}

async function runRetentionJob() {
  await db.query("select public.delete_expired_booking_requests()");
}

async function stillThere(...ids: string[]) {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.booking_requests where id = any($1::uuid[])",
    [ids],
  );
  const kept = new Set(rows.map((r) => r.id));
  return ids.map((id) => kept.has(id));
}

describe.skipIf(!running)("retention job (local Supabase)", () => {
  beforeEach(async () => {
    db = new Client({ connectionString: LOCAL_DB_URL });
    await db.connect();
    await db.query("begin");
  });

  afterEach(async () => {
    await db.query("rollback");
    await db.end();
  });

  it("keeps a booking with no email or phone until two years after its own session", async () => {
    const recent = await bookingFrom("23 months");
    const old = await bookingFrom("25 months");

    await runRetentionJob();

    expect(await stillThere(recent, old)).toEqual([true, false]);
  });

  it("keeps no-email bookings sharing a phone, however it's written, while any is within two years", async () => {
    const old = await bookingFrom("3 years", { phone: "(555) 010-2030" });
    const recent = await bookingFrom("1 year", { phone: "555.010.2030" });
    const stranger = await bookingFrom("3 years", { phone: "555 010 9999" });

    await runRetentionJob();

    expect(await stillThere(old, recent, stranger)).toEqual([true, true, false]);
  });

  it("deletes no-email bookings sharing a phone once all are over two years old", async () => {
    const older = await bookingFrom("4 years", { phone: "(555) 010-2030" });
    const old = await bookingFrom("25 months", { phone: "555-010-2030" });

    await runRetentionJob();

    expect(await stillThere(older, old)).toEqual([false, false]);
  });

  it("still groups by email, ignoring case, so a regular client's early bookings stay", async () => {
    const early = await bookingFrom("5 years", { email: "Pat@Example.test" });
    const latest = await bookingFrom("6 months", { email: "pat@example.test" });
    const lapsed = await bookingFrom("3 years", { email: "lapsed@example.test" });

    await runRetentionJob();

    expect(await stillThere(early, latest, lapsed)).toEqual([true, true, false]);
  });
});
