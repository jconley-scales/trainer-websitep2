import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROTECTED_PREFIXES } from "@/lib/portal-routes";

describe("portal route protection", () => {
  it("covers every top-level folder under app/(portal)", () => {
    const dir = join(process.cwd(), "app", "(portal)");
    const segments = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("("))
      .map((e) => e.name);
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(PROTECTED_PREFIXES, `/${segment} is a portal page but is not protected`).toContain(
        `/${segment}`,
      );
    }
  });
});
