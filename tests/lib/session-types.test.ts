import { describe, expect, it } from "vitest";
import { isSessionType, SESSION_TYPES, sessionTypeFormat, sessionTypeTag, sessionTypeTitle } from "@/lib/session-types";
import { SITE } from "@/lib/site";

describe("session types", () => {
  it("match the pricing groups' ids, titles and intros, in the same order", () => {
    expect(SESSION_TYPES.map(({ id, title, intro }) => ({ id, title, intro }))).toEqual(
      SITE.pricing.map(({ id, title, intro }) => ({ id, title, intro })),
    );
  });

  it("are 1-on-1 and Partner, in person or virtual, with short tags for the trainer", () => {
    expect(SESSION_TYPES.map((t) => t.id)).toEqual(["one-on-one", "partner", "virtual-one-on-one", "virtual-partner"]);
    expect(sessionTypeTitle("one-on-one")).toBe("1-on-1 training");
    expect(sessionTypeTitle("partner")).toBe("Partner training");
    expect(sessionTypeTitle("virtual-one-on-one")).toBe("Virtual 1-on-1 training");
    expect(sessionTypeTitle("virtual-partner")).toBe("Virtual partner training");
    expect(sessionTypeTag("one-on-one")).toBe("1-on-1");
    expect(sessionTypeTag("partner")).toBe("Partner");
    expect(sessionTypeTag("virtual-one-on-one")).toBe("Virtual 1-on-1");
    expect(sessionTypeTag("virtual-partner")).toBe("Virtual partner");
  });

  it("say which schedule they use", () => {
    expect(sessionTypeFormat("one-on-one")).toBe("in-person");
    expect(sessionTypeFormat("partner")).toBe("in-person");
    expect(sessionTypeFormat("virtual-one-on-one")).toBe("virtual");
    expect(sessionTypeFormat("virtual-partner")).toBe("virtual");
  });

  it("accept only the known ids", () => {
    expect(isSessionType("one-on-one")).toBe(true);
    expect(isSessionType("partner")).toBe(true);
    expect(isSessionType("virtual-one-on-one")).toBe(true);
    expect(isSessionType("virtual-partner")).toBe(true);
    for (const value of ["", "pair", "Partner", "virtual", "Virtual partner", null, undefined, 1, {}]) {
      expect(isSessionType(value)).toBe(false);
    }
  });
});
