import { describe, expect, it } from "vitest";
import { availableDays, availabilityWindow, gymTimeToUtc, utcToGymTime, withoutTaken } from "@/lib/booking-availability";

// Thursday 2026-10-22 noon UTC = 8:00 in New York (EDT), so that day's 8:00
// session has already started and only 9:45 is still offered.
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

const WEEKEND_TIMES = ["08:00", "09:45", "11:30", "13:15", "15:00"];
const VIRTUAL_TIMES = ["11:00", "12:45", "14:30"];
const BREAK = 45 * 60 * 1000;

describe("in-person availability", () => {
  it("offers only future Thursday, Saturday and Sunday slots, each 1 hour", () => {
    const days = availableDays(NOW, "in-person");
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

  it("offers Thursday at 8:00 and 9:45", () => {
    const thursday = availableDays(NOW, "in-person").find((d) => d.date === "2026-10-29");
    expect(thursday?.slots.map((s) => localTime(s.startsAt))).toEqual(["08:00", "09:45"]);
  });

  it("offers weekends from 8:00 to 15:00, all ending by 4pm", () => {
    const days = availableDays(NOW, "in-person");
    for (const date of ["2026-10-24", "2026-10-25"]) {
      const day = days.find((d) => d.date === date);
      expect(day?.slots.map((s) => localTime(s.startsAt))).toEqual(WEEKEND_TIMES);
      for (const slot of day!.slots) {
        expect(localTime(slot.endsAt) <= "16:00").toBe(true);
      }
    }
  });

  it("drops a slot that has already started today", () => {
    const today = availableDays(NOW, "in-person").find((d) => d.date === "2026-10-22");
    expect(today?.slots.map((s) => localTime(s.startsAt))).toEqual(["09:45"]);
  });

  it("places 8:00 in the gym's zone at the right UTC instant across daylight saving", () => {
    const days = availableDays(NOW, "in-person");
    // EDT (UTC-4) on Saturday 24 October; EST (UTC-5) on Sunday 1 November.
    expect(days.find((d) => d.date === "2026-10-24")?.slots[0].startsAt).toBe("2026-10-24T12:00:00.000Z");
    expect(days.find((d) => d.date === "2026-11-01")?.slots[0].startsAt).toBe("2026-11-01T13:00:00.000Z");
  });
});

describe("virtual availability", () => {
  it("offers only Saturday and Sunday, at 11:00, 12:45 and 2:30, each 1 hour and over by 4pm", () => {
    const days = availableDays(NOW, "virtual");
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect([6, 0]).toContain(new Date(`${day.date}T12:00:00Z`).getUTCDay());
      expect(day.slots.map((s) => localTime(s.startsAt))).toEqual(VIRTUAL_TIMES);
      for (const slot of day.slots) {
        expect(Date.parse(slot.endsAt) - Date.parse(slot.startsAt)).toBe(HOUR);
        expect(localTime(slot.endsAt) <= "16:00").toBe(true);
      }
    }
  });

  it("offers no virtual sessions on Thursday", () => {
    expect(availableDays(NOW, "virtual").find((d) => d.date === "2026-10-29")).toBeUndefined();
  });
});

describe("both schedules", () => {
  it.each(["in-person", "virtual"] as const)("leave a 45-minute break between %s sessions on the same day", (format) => {
    for (const day of availableDays(NOW, format)) {
      for (let i = 1; i < day.slots.length; i++) {
        const gap = Date.parse(day.slots[i].startsAt) - Date.parse(day.slots[i - 1].endsAt);
        expect(gap).toBe(BREAK);
      }
    }
  });

  it.each(["in-person", "virtual"] as const)("fall inside the lookup window (%s)", (format) => {
    const { from, to } = availabilityWindow(NOW);
    for (const slot of availableDays(NOW, format).flatMap((d) => d.slots)) {
      // A booking up to the break either side of a slot still matters, so the window reaches that far too.
      expect(Date.parse(slot.startsAt) - BREAK).toBeGreaterThanOrEqual(from.getTime());
      expect(Date.parse(slot.endsAt) + BREAK).toBeLessThanOrEqual(to.getTime());
    }
  });
});

describe("withoutTaken", () => {
  const MINUTE = 60 * 1000;
  /** A booked time, from its ISO start and length in minutes. */
  const booked = (startIso: string, minutes = 60) => ({
    start: Date.parse(startIso),
    end: Date.parse(startIso) + minutes * MINUTE,
  });
  /** Saturday 2026-10-24's slot times (New York) for one schedule, once `taken` is removed. */
  const saturdayAfter = (format: "in-person" | "virtual", taken: { start: number; end: number }[]) =>
    withoutTaken(availableDays(NOW, format), taken)
      .find((d) => d.date === "2026-10-24")
      ?.slots.map((s) => localTime(s.startsAt));

  it("drops a taken slot, matching instants whatever the ISO format", () => {
    const first = availableDays(NOW, "in-person").find((d) => d.date === "2026-10-24")!.slots[0];
    // The database returns "+00:00" offsets rather than ".000Z".
    const taken = [booked(first.startsAt.replace(".000Z", "+00:00"))];
    expect(saturdayAfter("in-person", taken)).toEqual(WEEKEND_TIMES.slice(1));
  });

  it("drops a slot a booking at another time overlaps, or leaves less than the break beside", () => {
    // The trainer's 10:00 to 11:00 (New York, EDT) session overlaps 9:45, and
    // would leave only 30 minutes before 11:30.
    const taken = [booked("2026-10-24T14:00:00Z", 60)];
    expect(saturdayAfter("in-person", taken)).toEqual(["08:00", "13:15", "15:00"]);
  });

  it("keeps a slot exactly the break away from a booking", () => {
    // 6:15 to 7:15 New York ends exactly 45 minutes before the 8:00 slot.
    expect(saturdayAfter("in-person", [booked("2026-10-24T10:15:00Z", 60)])).toEqual(WEEKEND_TIMES);
    // 9:15 to 10:15 New York ends exactly 45 minutes before the 11:00 virtual slot.
    expect(saturdayAfter("virtual", [booked("2026-10-24T13:15:00Z", 60)])).toEqual(VIRTUAL_TIMES);
  });

  it("keeps the trainer's break between in-person and virtual sessions on the same day", () => {
    // A virtual session 11:00 to 12:00 New York hides in-person 9:45 (ends
    // 10:45, too close) and 11:30 (overlaps), but not 1:15.
    const virtual = [booked("2026-10-24T15:00:00Z")];
    expect(saturdayAfter("in-person", virtual)).toEqual(["08:00", "13:15", "15:00"]);
    expect(saturdayAfter("virtual", virtual)).toEqual(["12:45", "14:30"]);

    // An in-person session 1:15 to 2:15 hides virtual 12:45 and 2:30.
    const inPerson = [booked("2026-10-24T17:15:00Z")];
    expect(saturdayAfter("virtual", inPerson)).toEqual(["11:00"]);
  });

  it("drops a day once all its slots are taken", () => {
    const days = availableDays(NOW, "in-person");
    const taken = days[0].slots.map((s) => booked(s.startsAt));
    const result = withoutTaken(days, taken);
    expect(result.map((d) => d.date)).not.toContain(days[0].date);
    expect(result).toHaveLength(days.length - 1);
  });

  it("changes nothing when nothing is taken", () => {
    const days = availableDays(NOW, "virtual");
    expect(withoutTaken(days, [])).toEqual(days);
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

describe("utcToGymTime", () => {
  it("gives the gym-zone date and time of an instant, as the booking form takes them", () => {
    expect(utcToGymTime("2030-07-11T14:15:00.000Z")).toEqual({ date: "2030-07-11", time: "10:15" });
    expect(utcToGymTime("2030-01-10T13:00:00Z")).toEqual({ date: "2030-01-10", time: "08:00" });
  });

  it("gives the gym's date, not UTC's, late in the evening", () => {
    // 11:30 PM Eastern on the 10th is already the 11th in UTC.
    expect(utcToGymTime("2030-01-11T04:30:00Z")).toEqual({ date: "2030-01-10", time: "23:30" });
  });

  it("writes midnight as 00:00", () => {
    expect(utcToGymTime("2030-01-10T05:00:00Z")).toEqual({ date: "2030-01-10", time: "00:00" });
  });
});
