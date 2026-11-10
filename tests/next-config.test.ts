import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("old Wix site redirects", () => {
  it("sends the Wix pricing pages to /pricing permanently", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/list", destination: "/pricing", permanent: true },
        { source: "/pricing-plans/:path*", destination: "/pricing", permanent: true },
      ]),
    );
  });
});
