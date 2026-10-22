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
const clientId = randomUUID();
let admin: Client;

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
  for (const [id, name, phone, role] of [
    [trainerId, "Taylor Trainer", "555-0100", "trainer"],
    [clientId, "Casey Client", "555-0101", "client"],
  ] as const) {
    await admin.query(
      "insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)",
      [id, `${id}@example.test`],
    );
    await admin.query(
      "insert into public.profiles (id, full_name, phone, role) values ($1, $2, $3, $4)",
      [id, name, phone, role],
    );
  }
});

afterAll(async () => {
  if (!admin) return;
  await admin.query("delete from auth.users where id = any($1)", [
    [trainerId, clientId],
  ]);
  await admin.end();
});

describe("public.trainer_public()", () => {
  it("lets a client read trainers' id and name, and only that", async () => {
    const rows = await asUser(clientId, async (db) =>
      (await db.query("select * from public.trainer_public() where id = $1", [trainerId]))
        .rows,
    );
    expect(rows).toEqual([{ id: trainerId, full_name: "Taylor Trainer" }]);
  });

  it("does not return clients", async () => {
    const rows = await asUser(clientId, async (db) =>
      (await db.query("select id from public.trainer_public() where id = $1", [clientId]))
        .rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("does not open the profiles table to other users", async () => {
    const rows = await asUser(clientId, async (db) =>
      (await db.query("select id from public.profiles where id = $1", [trainerId])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("is not callable by anonymous users", async () => {
    await expect(
      asUser(null, (db) => db.query("select * from public.trainer_public()")),
    ).rejects.toThrow(/permission denied/i);
  });
});
