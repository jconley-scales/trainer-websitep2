/**
 * Idempotent slot seeding for the workout-booking portal.
 *
 * All times are interpreted in UTC: a template time of "09:00" means 09:00Z.
 * `slots.starts_at` / `ends_at` are timestamptz, so they are stored as
 * absolute instants and no server timezone is involved.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday ... 6 = Saturday (UTC)

export type WeeklyTemplateEntry = {
  weekday: Weekday;
  /** "HH:MM", 24-hour, UTC. */
  time: string;
  durationMin: number;
  location: string;
  trainerId: string;
};

export type WeeklyTemplate = WeeklyTemplateEntry[];

export type SlotInput = {
  starts_at: Date;
  ends_at: Date;
  trainer_id: string;
  location: string;
};

/** Minimal query surface satisfied by `pg`'s Client and Pool. */
export type SeedDb = {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rowCount: number | null }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTime(time: string): { hours: number; minutes: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) throw new Error(`Invalid time "${time}", expected HH:MM`);
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

/**
 * Expand a weekly template across `weeks` weeks starting at the UTC calendar
 * day of `from`. Covers the window [from's UTC date, +7*weeks days); each
 * template entry yields one slot per matching weekday inside it. Results are
 * sorted by start time.
 */
export function generateSlots(
  template: WeeklyTemplate,
  weeks: number,
  from: Date,
): SlotInput[] {
  if (!Number.isInteger(weeks) || weeks < 0) {
    throw new Error(`weeks must be a non-negative integer, got ${weeks}`);
  }

  const startDay = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const slots: SlotInput[] = [];

  for (const entry of template) {
    if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6) {
      throw new Error(`Invalid weekday ${entry.weekday}, expected 0-6`);
    }
    if (!(entry.durationMin > 0)) {
      throw new Error(`durationMin must be positive, got ${entry.durationMin}`);
    }
    const { hours, minutes } = parseTime(entry.time);
    const startWeekday = new Date(startDay).getUTCDay();
    const offset = (entry.weekday - startWeekday + 7) % 7;

    for (let w = 0; w < weeks; w++) {
      const day = startDay + (offset + 7 * w) * DAY_MS;
      const startsAt = new Date(day + (hours * 60 + minutes) * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + entry.durationMin * 60 * 1000);
      slots.push({
        starts_at: startsAt,
        ends_at: endsAt,
        trainer_id: entry.trainerId,
        location: entry.location,
      });
    }
  }

  return slots.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
}

/**
 * Insert slots, skipping any that already exist for the same
 * (trainer_id, starts_at). Safe to run repeatedly. Returns the number of
 * rows actually inserted.
 */
export async function seedSlots(
  db: SeedDb,
  slots: SlotInput[],
): Promise<{ inserted: number }> {
  if (slots.length === 0) return { inserted: 0 };

  const result = await db.query(
    `insert into public.slots (starts_at, ends_at, trainer_id, location)
     select * from unnest($1::timestamptz[], $2::timestamptz[], $3::uuid[], $4::text[])
     on conflict (trainer_id, starts_at) do nothing`,
    [
      slots.map((s) => s.starts_at.toISOString()),
      slots.map((s) => s.ends_at.toISOString()),
      slots.map((s) => s.trainer_id),
      slots.map((s) => s.location),
    ],
  );
  return { inserted: result.rowCount ?? 0 };
}
