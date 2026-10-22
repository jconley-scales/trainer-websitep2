// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateSlots,
  seedSlots,
  type WeeklyTemplate,
} from "../../supabase/seed/seed-slots";

function loadDbUrl(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("SUPABASE_DB_URL="));
  if (!line) throw new Error("SUPABASE_DB_URL missing from .env.local");
  return line.slice("SUPABASE_DB_URL=".length).trim();
}

const trainerId = randomUUID();

// Mon/Wed/Fri 09:00 (UTC), 60 minutes.
const template: WeeklyTemplate = [1, 3, 5].map((weekday) => ({
  weekday: weekday as 1 | 3 | 5,
  time: "09:00",
  durationMin: 60,
  location: "Main Gym",
  trainerId,
}));

// Monday 2026-11-02, 00:00 UTC.
const from = new Date(Date.UTC(2026, 10, 2));

let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: loadDbUrl() });
  await admin.connect();
  await admin.query(
    "insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)",
    [trainerId, `${trainerId}@example.test`],
  );
  await admin.query(
    "insert into public.profiles (id, full_name, role) values ($1, 'Seed Trainer', 'trainer')",
    [trainerId],
  );
});

afterAll(async () => {
  if (!admin) return;
  await admin.query("delete from public.slots where trainer_id = $1", [
    trainerId,
  ]);
  await admin.query("delete from public.profiles where id = $1", [trainerId]);
  await admin.query("delete from auth.users where id = $1", [trainerId]);
  await admin.end();
});

async function countSlots(): Promise<number> {
  const { rows } = await admin.query(
    "select count(*)::int as n from public.slots where trainer_id = $1",
    [trainerId],
  );
  return rows[0].n;
}

describe("generateSlots", () => {
  it("expands Mon/Wed/Fri 09:00 over 4 weeks into 12 slots", () => {
    const slots = generateSlots(template, 4, from);
    expect(slots).toHaveLength(12);

    const starts = slots.map((s) => s.starts_at.toISOString());
    expect(starts).toEqual([
      "2026-11-02T09:00:00.000Z",
      "2026-11-04T09:00:00.000Z",
      "2026-11-06T09:00:00.000Z",
      "2026-11-09T09:00:00.000Z",
      "2026-11-11T09:00:00.000Z",
      "2026-11-13T09:00:00.000Z",
      "2026-11-16T09:00:00.000Z",
      "2026-11-18T09:00:00.000Z",
      "2026-11-20T09:00:00.000Z",
      "2026-11-23T09:00:00.000Z",
      "2026-11-25T09:00:00.000Z",
      "2026-11-27T09:00:00.000Z",
    ]);

    for (const s of slots) {
      expect(s.ends_at.getTime() - s.starts_at.getTime()).toBe(60 * 60 * 1000);
      expect(s.trainer_id).toBe(trainerId);
      expect(s.location).toBe("Main Gym");
    }
  });

  it("starts from the first matching weekday on or after `from`", () => {
    // Wednesday 2026-11-04: Monday of that week is before `from`, so skipped.
    const wed = new Date(Date.UTC(2026, 10, 4));
    const slots = generateSlots(template, 1, wed);
    expect(slots.map((s) => s.starts_at.toISOString())).toEqual([
      "2026-11-04T09:00:00.000Z",
      "2026-11-06T09:00:00.000Z",
      "2026-11-09T09:00:00.000Z",
    ]);
  });
});

describe("seedSlots", () => {
  it("is idempotent: seeding twice leaves the count unchanged", async () => {
    const slots = generateSlots(template, 4, from);
    expect(await countSlots()).toBe(0);

    const first = await seedSlots(admin, slots);
    expect(first.inserted).toBe(12);
    expect(await countSlots()).toBe(12);

    const second = await seedSlots(admin, slots);
    expect(second.inserted).toBe(0);
    expect(await countSlots()).toBe(12);
  });
});
