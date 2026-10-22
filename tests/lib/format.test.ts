import { describe, expect, it } from "vitest";
import {
  DISPLAY_TIME_ZONE,
  formatDate,
  formatTime,
  formatTimeRange,
} from "@/lib/format";

describe("session date/time formatting", () => {
  it("displays in one configured time zone", () => {
    expect(DISPLAY_TIME_ZONE).toBe("America/New_York");
  });

  it("shows the long date with the weekday", () => {
    expect(formatDate("2030-03-05T15:00:00Z")).toBe("Tuesday, March 5, 2030");
  });

  it("converts UTC to the display zone, standard and daylight time", () => {
    expect(formatTime("2030-03-05T15:00:00Z")).toBe("10:00 AM"); // EST, UTC-5
    expect(formatTime("2030-07-02T22:30:00Z")).toBe("6:30 PM"); // EDT, UTC-4
  });

  it("uses the display zone's calendar day, not UTC's", () => {
    // 02:00 UTC on the 6th is still the evening of the 5th in New York.
    expect(formatDate("2030-03-06T02:00:00Z")).toBe("Tuesday, March 5, 2030");
    expect(formatTime("2030-03-06T02:00:00Z")).toBe("9:00 PM");
  });

  it("formats a range with plain spaces and the word 'to'", () => {
    const range = formatTimeRange("2030-03-05T15:00:00Z", "2030-03-05T16:30:00Z");
    expect(range).toBe("10:00 AM to 11:30 AM");
    expect(range).not.toMatch(/[  ]/);
  });
});
