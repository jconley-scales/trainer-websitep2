// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function loadDbUrl(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("SUPABASE_DB_URL="));
  if (!line) throw new Error("SUPABASE_DB_URL missing from .env.local");
  return line.slice("SUPABASE_DB_URL=".length).trim();
}

const trainerId = randomUUID();
const clientA = randomUUID();
const clientB = randomUUID();
const slotId = randomUUID();
const slot2Id = randomUUID();
const bookingA = randomUUID();

let admin: Client;

/** Run `fn` inside a transaction as the given authenticated user (RLS applies). */
async function asUser<T>(
  userId: string | null,
  fn: (db: Client) => Promise<T>,
): Promise<T> {
  await admin.query("begin");
  try {
    if (userId === null) {
      await admin.query("set local role anon");
    } else {
      await admin.query("set local role authenticated");
      await admin.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    }
    return await fn(admin);
  } finally {
    await admin.query("rollback");
  }
}

beforeAll(async () => {
  admin = new Client({ connectionString: loadDbUrl() });
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
  await admin.query(
    "insert into public.slots (id, starts_at, ends_at, trainer_id, location) values ($1, now() + interval '1 day', now() + interval '1 day 1 hour', $2, 'Gym')",
    [slotId, trainerId],
  );
  await admin.query(
    "insert into public.slots (id, starts_at, ends_at, trainer_id, location) values ($1, now() + interval '2 day', now() + interval '2 day 1 hour', $2, 'Gym')",
    [slot2Id, trainerId],
  );
  await admin.query(
    "insert into public.bookings (id, slot_id, client_id, status) values ($1, $2, $3, 'booked')",
    [bookingA, slotId, clientA],
  );
});

afterAll(async () => {
  if (!admin) return;
  await admin.query("delete from public.bookings where slot_id = any($1)", [
    [slotId, slot2Id],
  ]);
  await admin.query("delete from public.slots where id = any($1)", [
    [slotId, slot2Id],
  ]);
  await admin.query("delete from auth.users where id = any($1)", [
    [trainerId, clientA, clientB],
  ]);
  await admin.end();
});

describe("row level security", () => {
  it("is enabled on profiles, slots and bookings", async () => {
    const { rows } = await admin.query(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1)",
      [["profiles", "slots", "bookings"]],
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.relrowsecurity).toBe(true);
  });

  it("lets client A see exactly their own booking", async () => {
    const rows = await asUser(clientA, async (db) =>
      (await db.query("select id, client_id from public.bookings")).rows,
    );
    expect(rows).toEqual([{ id: bookingA, client_id: clientA }]);
  });

  it("hides client A's booking from client B", async () => {
    const rows = await asUser(clientB, async (db) =>
      (await db.query("select id from public.bookings where id = $1", [bookingA]))
        .rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("stops client B from cancelling client A's booking", async () => {
    const affected = await asUser(clientB, async (db) =>
      (
        await db.query(
          "update public.bookings set status = 'cancelled', cancelled_at = now() where id = $1",
          [bookingA],
        )
      ).rowCount,
    );
    expect(affected).toBe(0);
    const { rows } = await admin.query(
      "select status from public.bookings where id = $1",
      [bookingA],
    );
    expect(rows[0].status).toBe("booked");
  });

  it("stops client B from inserting a booking as client A", async () => {
    await expect(
      asUser(clientB, (db) =>
        db.query(
          "insert into public.bookings (slot_id, client_id) values ($1, $2)",
          [slotId, clientA],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets client A book an open slot for themselves", async () => {
    const rows = await asUser(clientA, async (db) =>
      (
        await db.query(
          "insert into public.bookings (slot_id, client_id) values ($1, $2) returning client_id, status",
          [slot2Id, clientA],
        )
      ).rows,
    );
    expect(rows).toEqual([{ client_id: clientA, status: "booked" }]);
  });

  it("lets client A cancel their own booking", async () => {
    const result = await asUser(clientA, async (db) => {
      const update = await db.query(
        "update public.bookings set status = 'cancelled', cancelled_at = now() where id = $1",
        [bookingA],
      );
      const { rows } = await db.query(
        "select status from public.bookings where id = $1",
        [bookingA],
      );
      return { count: update.rowCount, status: rows[0]?.status };
    });
    expect(result).toEqual({ count: 1, status: "cancelled" });
  });

  it("rejects client A reassigning their booking to client B", async () => {
    await expect(
      asUser(clientA, (db) =>
        db.query("update public.bookings set client_id = $1 where id = $2", [
          clientB,
          bookingA,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("denies unauthenticated (anon) access to bookings", async () => {
    await expect(
      asUser(null, (db) => db.query("select id from public.bookings")),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets any authenticated user read slots", async () => {
    const rows = await asUser(clientB, async (db) =>
      (await db.query("select id from public.slots where id = $1", [slotId])).rows,
    );
    expect(rows).toHaveLength(1);
  });

  it("limits profiles to the user's own row", async () => {
    const rows = await asUser(clientA, async (db) =>
      (await db.query("select id from public.profiles")).rows,
    );
    expect(rows).toEqual([{ id: clientA }]);
  });
});

describe("profiles", () => {
  it("lets a client update their own name", async () => {
    const affected = await asUser(
      clientA,
      async (db) =>
        (
          await db.query(
            "update public.profiles set full_name = 'Renamed' where id = $1",
            [clientA],
          )
        ).rowCount,
    );
    expect(affected).toBe(1);
  });

  it("stops a client promoting themselves to trainer", async () => {
    await expect(
      asUser(clientA, (db) =>
        db.query("update public.profiles set role = 'trainer' where id = $1", [
          clientA,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await admin.query(
      "select role from public.profiles where id = $1",
      [clientA],
    );
    expect(rows[0].role).toBe("client");
  });

  it("stops client B updating client A's profile", async () => {
    const affected = await asUser(
      clientB,
      async (db) =>
        (
          await db.query(
            "update public.profiles set full_name = 'Hacked' where id = $1",
            [clientA],
          )
        ).rowCount,
    );
    expect(affected).toBe(0);
    const { rows } = await admin.query(
      "select full_name from public.profiles where id = $1",
      [clientA],
    );
    expect(rows[0].full_name).toBe("Client A");
  });
});

describe("no double booking", () => {
  it("rejects a second active booking for the same slot", async () => {
    await expect(
      admin.query(
        "insert into public.bookings (slot_id, client_id, status) values ($1, $2, 'booked')",
        [slotId, clientB],
      ),
    ).rejects.toThrow(/uniq_active_booking_per_slot/);
  });
});
