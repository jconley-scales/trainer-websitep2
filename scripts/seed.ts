/**
 * Seed bookable slots into the database. Safe to re-run: slots that already
 * exist for the same (trainer_id, starts_at) are skipped.
 *
 *   npm run seed
 *
 * Reads from the environment or `.env.local`:
 *   SUPABASE_DB_URL   direct Postgres connection string
 *   SEED_TRAINER_ID   profiles.id of the trainer (role = 'trainer') who owns the slots
 *   SEED_WEEKS        optional, how many weeks ahead to generate (default 4)
 *
 * PLACEHOLDERS: the weekly template below (Mon/Wed/Fri mornings, "Main Gym") is
 * made up until the gym's real schedule, locations and timezone are provided.
 * Template times are interpreted as UTC (see supabase/seed/seed-slots.ts), so
 * "09:00" is 09:00Z, not local time. Once the real gym timezone is known, convert
 * the times (or teach the seed about timezones) to match DISPLAY_TIME_ZONE in
 * lib/format.ts, which is how the portal shows times to clients.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import {
  generateSlots,
  seedSlots,
  type WeeklyTemplate,
} from "../supabase/seed/seed-slots";

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() || undefined : undefined;
  } catch {
    return undefined;
  }
}

function required(name: string): string {
  const value = envVar(name);
  if (!value) {
    console.error(`${name} is not set (put it in the environment or .env.local).`);
    process.exit(1);
  }
  return value;
}

const dbUrl = required("SUPABASE_DB_URL");
const trainerId = required("SEED_TRAINER_ID");
const weeks = Number(envVar("SEED_WEEKS") ?? 4);

// PLACEHOLDER weekly template, times in UTC. Replace with the real schedule.
const template: WeeklyTemplate = [
  { weekday: 1, time: "09:00", durationMin: 60, location: "Main Gym", trainerId }, // Mon
  { weekday: 3, time: "09:00", durationMin: 60, location: "Main Gym", trainerId }, // Wed
  { weekday: 5, time: "09:00", durationMin: 60, location: "Main Gym", trainerId }, // Fri
  { weekday: 1, time: "10:30", durationMin: 60, location: "Main Gym", trainerId },
  { weekday: 3, time: "10:30", durationMin: 60, location: "Main Gym", trainerId },
  { weekday: 5, time: "10:30", durationMin: 60, location: "Main Gym", trainerId },
];

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  const slots = generateSlots(template, weeks, new Date());
  const { inserted } = await seedSlots(client, slots);
  console.log(
    `Generated ${slots.length} slots over ${weeks} weeks; inserted ${inserted} (${slots.length - inserted} already existed).`,
  );
} finally {
  await client.end();
}
