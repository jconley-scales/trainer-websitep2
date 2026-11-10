import { describe, expect, it } from "vitest";
import { isSessionType, SESSION_TYPES, sessionTypeTag, sessionTypeTitle } from "@/lib/session-types";
import { SITE } from "@/lib/site";

describe("session types", () => {
  it("match the pricing groups' ids, titles and intros, in the same order", () => {
    expect(SESSION_TYPES.map(({ id, title, intro }) => ({ id, title, intro }))).toEqual(
      SITE.pricing.map(({ id, title, intro }) => ({ id, title, intro })),
    );
  });

  it("are 1-on-1 and Partner, with short tags for the trainer", () => {
    expect(sessionTypeTitle("one-on-one")).toBe("1-on-1 training");
    expect(sessionTypeTitle("partner")).toBe("Partner training");
    expect(sessionTypeTag("one-on-one")).toBe("1-on-1");
    expect(sessionTypeTag("partner")).toBe("Partner");
  });

  it("accept only the known ids", () => {
    expect(isSessionType("one-on-one")).toBe(true);
    expect(isSessionType("partner")).toBe(true);
    for (const value of ["", "pair", "Partner", null, undefined, 1, {}]) {
      expect(isSessionType(value)).toBe(false);
    }
  });
});
