import { DISPLAY_TIME_ZONE } from "@/lib/format";

/**
 * Availability for the public booking page.
 *
 * Bookable times are generated here from the trainer's weekly schedule, in the
 * gym's display time zone (see DISPLAY_TIME_ZONE in lib/format.ts). There is
 * one instructor, so each time takes one booking.
 *
 * Sessions are 1 hour, and start times are spaced 90 minutes apart so the
 * instructor always has a 30-minute break to travel to the next location:
 * - Thursday: 8:00 and 9:30
 * - Saturday and Sunday: 8:00, 9:30, 11:00, 12:30, 2:00 and 3:30 (open until 5pm)
 *
 * Each slot's `startsAt`/`endsAt` are real UTC instants, so the time the client
 * picks is stored unambiguously; the labels are already in the gym's zone.
 */

const SESSION_MINUTES = 60;
/** Travel time between sessions, so the instructor can reach the next location. */
const BREAK_MINUTES = 30;

/** Session start times (gym zone, 24h), every SESSION_MINUTES + BREAK_MINUTES from `first`. */
function startTimes(first: string, count: number): string[] {
  const [h, m] = first.split(":").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = h * 60 + m + i * (SESSION_MINUTES + BREAK_MINUTES);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
}

/** Start times by weekday (0 = Sunday … 6 = Saturday). Days not listed are closed. */
const SCHEDULE: Partial<Record<number, string[]>> = {
  4: startTimes("08:00", 2), // Thursday: 8:00, 9:30
  6: startTimes("08:00", 6), // Saturday: 8:00 … 15:30 (ends 16:30)
  0: startTimes("08:00", 6), // Sunday: same as Saturday
};
/** How many days ahead to offer. */
const DAYS_AHEAD = 28;

export type AvailableSlot = {
  /** Stable id for this slot (the UTC start, used as the option value). */
  id: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
};

export type AvailableDay = {
  /** The calendar date in the gym's zone, as YYYY-MM-DD. */
  date: string;
  slots: AvailableSlot[];
};

/**
 * The offset, in minutes, of `timeZone` from UTC at the given instant
 * (handles daylight saving). Positive means ahead of UTC.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  // Format the instant as if it were wall-clock time in the zone, read it back
  // as UTC, and compare: the difference is the zone's offset at that instant.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some ICU versions report midnight as 24
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The UTC instant for a given wall-clock date+time in the gym's zone. */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // First guess treats the wall time as UTC, then corrects by the zone offset
  // at that instant. One correction is enough away from DST boundaries.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = zoneOffsetMinutes(guess, DISPLAY_TIME_ZONE);
  return new Date(guess.getTime() - offset * 60000);
}

/**
 * The UTC instant for a gym-zone calendar date ("YYYY-MM-DD") and wall-clock
 * time ("HH:MM", 24h), as the trainer types them on /admin. Null if either
 * does not exist (e.g. "2030-02-30" or "24:00").
 *
 * Corrects twice, so a time just after the clocks change still lands on the
 * right hour (one correction uses the offset from the wrong side of the change).
 */
export function gymTimeToUtc(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (hour > 23 || minute > 59) return null;
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (asUtc.getUTCMonth() !== month - 1 || asUtc.getUTCDate() !== day) return null;

  const first = zonedTimeToUtc(year, month, day, hour, minute);
  const offset = zoneOffsetMinutes(first, DISPLAY_TIME_ZONE);
  return new Date(asUtc.getTime() - offset * 60000);
}

/** The gym-zone weekday (0–6) and Y/M/D for a UTC instant. */
function zonedParts(instant: Date): { weekday: number; year: number; month: number; day: number; date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    weekday: weekdayMap[get("weekday")],
    year,
    month,
    day,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** How far ahead the booking page looks, for fetching which times are taken. */
export function availabilityWindow(now: Date): { from: Date; to: Date } {
  return { from: now, to: new Date(now.getTime() + (DAYS_AHEAD + 1) * 24 * 60 * 60 * 1000) };
}

/**
 * Drop the slots that are already taken (by start instant), and any day left
 * with no slots. `taken` holds epoch milliseconds, so ISO strings in different
 * formats (".000Z" vs "+00:00") still compare equal.
 */
export function withoutTaken(days: AvailableDay[], taken: ReadonlySet<number>): AvailableDay[] {
  return days
    .map((day) => ({
      ...day,
      slots: day.slots.filter((slot) => !taken.has(Date.parse(slot.startsAt))),
    }))
    .filter((day) => day.slots.length > 0);
}

/**
 * The available days (with their slots) from `now` forward, future-only.
 * Pure given `now`, so it is deterministic and easy to test.
 */
export function availableDays(now: Date): AvailableDay[] {
  const days: AvailableDay[] = [];
  for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
    const dayInstant = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const { weekday, year, month, day, date } = zonedParts(dayInstant);
    const times = SCHEDULE[weekday];
    if (!times) continue;

    const slots: AvailableSlot[] = [];
    for (const time of times) {
      const [h, m] = time.split(":").map(Number);
      const startsAt = zonedTimeToUtc(year, month, day, h, m);
      if (startsAt.getTime() <= now.getTime()) continue; // future only
      const endsAt = new Date(startsAt.getTime() + SESSION_MINUTES * 60000);
      slots.push({ id: startsAt.toISOString(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    }
    if (slots.length > 0) days.push({ date, slots });
  }
  return days;
}
