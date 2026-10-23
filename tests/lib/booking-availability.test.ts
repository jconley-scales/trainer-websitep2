import { describe, expect, it } from "vitest";
import { availableDays, availabilityWindow, withoutTaken } from "@/lib/booking-availability";

// Thursday 2026-10-22 noon UTC: the next offered days are Fri, Mon, Wed, ...
const NOW = new Date("2026-10-22T12:00:00Z");

describe("placeholder availability", () => {
  it("offers only future Mon/Wed/Fri slots, two per day", () => {
    const days = availableDays(NOW);
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
      expect([1, 3, 5]).toContain(weekday);
      expect(day.slots).toHaveLength(2);
      for (const slot of day.slots) {
        expect(Date.parse(slot.startsAt)).toBeGreaterThan(NOW.getTime());
        expect(Date.parse(slot.endsAt) - Date.parse(slot.startsAt)).toBe(60 * 60 * 1000);
      }
    }
  });

  it("places 9:00 in the gym's zone (New York, EDT in October) at 13:00 UTC", () => {
    const friday = availableDays(NOW).find((d) => d.date === "2026-10-23");
    expect(friday?.slots[0].startsAt).toBe("2026-10-23T13:00:00.000Z");
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
    const first = days[0].slots[0];
    // The database returns "+00:00" offsets rather than ".000Z".
    const taken = new Set([Date.parse(first.startsAt.replace(".000Z", "+00:00"))]);
    const result = withoutTaken(days, taken);
    expect(result[0].slots.map((s) => s.id)).not.toContain(first.id);
    expect(result[0].slots).toHaveLength(1);
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
