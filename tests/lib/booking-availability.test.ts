import { describe, expect, it } from "vitest";
import { availableDays, availabilityWindow, gymTimeToUtc, withoutTaken } from "@/lib/booking-availability";

// Thursday 2026-10-22 noon UTC = 8:00 in New York (EDT), so that day's 8:00
// session has already started and only 9:30 is still offered.
const NOW = new Date("2026-10-22T12:00:00Z");

const HOUR = 60 * 60 * 1000;

/** A slot's start as a New York wall-clock "HH:MM". */
function localTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const WEEKEND_TIMES = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30"];

describe("availability", () => {
  it("offers only future Thursday, Saturday and Sunday slots, each 1 hour", () => {
    const days = availableDays(NOW);
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
      expect([4, 6, 0]).toContain(weekday);
      for (const slot of day.slots) {
        expect(Date.parse(slot.startsAt)).toBeGreaterThan(NOW.getTime());
        expect(Date.parse(slot.endsAt) - Date.parse(slot.startsAt)).toBe(HOUR);
      }
    }
  });

  it("offers Thursday at 8:00 and 9:30", () => {
    const thursday = availableDays(NOW).find((d) => d.date === "2026-10-29");
    expect(thursday?.slots.map((s) => localTime(s.startsAt))).toEqual(["08:00", "09:30"]);
  });

  it("offers weekends from 8:00 to 15:30, all ending by 5pm", () => {
    const days = availableDays(NOW);
    for (const date of ["2026-10-24", "2026-10-25"]) {
      const day = days.find((d) => d.date === date);
      expect(day?.slots.map((s) => localTime(s.startsAt))).toEqual(WEEKEND_TIMES);
      for (const slot of day!.slots) {
        expect(localTime(slot.endsAt) <= "17:00").toBe(true);
      }
    }
  });

  it("leaves a 30-minute break between sessions on the same day", () => {
    for (const day of availableDays(NOW)) {
      for (let i = 1; i < day.slots.length; i++) {
        const gap = Date.parse(day.slots[i].startsAt) - Date.parse(day.slots[i - 1].endsAt);
        expect(gap).toBe(HOUR / 2);
      }
    }
  });

  it("drops a slot that has already started today", () => {
    const today = availableDays(NOW).find((d) => d.date === "2026-10-22");
    expect(today?.slots.map((s) => localTime(s.startsAt))).toEqual(["09:30"]);
  });

  it("places 8:00 in the gym's zone at the right UTC instant across daylight saving", () => {
    const days = availableDays(NOW);
    // EDT (UTC-4) on Saturday 24 October; EST (UTC-5) on Sunday 1 November.
    expect(days.find((d) => d.date === "2026-10-24")?.slots[0].startsAt).toBe("2026-10-24T12:00:00.000Z");
    expect(days.find((d) => d.date === "2026-11-01")?.slots[0].startsAt).toBe("2026-11-01T13:00:00.000Z");
  });

  it("covers the whole offered range with its lookup window", () => {
    const { from, to } = availabilityWindow(NOW);
    const all = availableDays(NOW).flatMap((d) => d.slots);
    for (const slot of all) {
      expect(Date.parse(slot.startsAt)).toBeGreaterThanOrEqual(from.getTime());
      expect(Date.parse(slot.startsAt)).toBeLessThan(to.getTime());
    }
  });
});

describe("withoutTaken", () => {
  it("drops a taken slot, matching instants whatever the ISO format", () => {
    const days = availableDays(NOW);
    // Saturday, which has several slots, so the day itself stays.
    const saturday = days.find((d) => d.date === "2026-10-24")!;
    const first = saturday.slots[0];
    // The database returns "+00:00" offsets rather than ".000Z".
    const taken = new Set([Date.parse(first.startsAt.replace(".000Z", "+00:00"))]);
    const after = withoutTaken(days, taken).find((d) => d.date === saturday.date)!;
    expect(after.slots.map((s) => s.id)).not.toContain(first.id);
    expect(after.slots).toHaveLength(saturday.slots.length - 1);
  });

  it("drops a day once all its slots are taken", () => {
    const days = availableDays(NOW);
    const taken = new Set(days[0].slots.map((s) => Date.parse(s.startsAt)));
    const result = withoutTaken(days, taken);
    expect(result.map((d) => d.date)).not.toContain(days[0].date);
    expect(result).toHaveLength(days.length - 1);
  });

  it("changes nothing when nothing is taken", () => {
    const days = availableDays(NOW);
    expect(withoutTaken(days, new Set())).toEqual(days);
  });
});

describe("gymTimeToUtc", () => {
  it("reads a summer date and time in the gym's zone (EDT, UTC-4)", () => {
    expect(gymTimeToUtc("2030-07-11", "10:15")?.toISOString()).toBe("2030-07-11T14:15:00.000Z");
  });

  it("reads a winter date and time in the gym's zone (EST, UTC-5)", () => {
    expect(gymTimeToUtc("2030-01-10", "08:00")?.toISOString()).toBe("2030-01-10T13:00:00.000Z");
  });

  it("gets the hour right just after the clocks go back", () => {
    // 2030-11-03: EDT ends at 2:00 AM, so 3:30 AM is EST.
    expect(gymTimeToUtc("2030-11-03", "03:30")?.toISOString()).toBe("2030-11-03T08:30:00.000Z");
  });

  it("returns null for a date or time that does not exist", () => {
    expect(gymTimeToUtc("2030-02-30", "10:00")).toBeNull();
    expect(gymTimeToUtc("2030-07-11", "24:00")).toBeNull();
    expect(gymTimeToUtc("2030-07-11", "10:60")).toBeNull();
    expect(gymTimeToUtc("next tuesday", "10:00")).toBeNull();
    expect(gymTimeToUtc("2030-07-11", "10am")).toBeNull();
  });
});
