import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarketingLayout from "@/app/(marketing)/layout";
import RootLayout from "@/app/layout";
import { SITE } from "@/lib/site";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function renderRoot() {
  const html = renderToStaticMarkup(
    <RootLayout>
      <p>Child content</p>
    </RootLayout>,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

function renderWith(Layout: (props: { children: React.ReactNode }) => React.ReactNode) {
  const html = renderToStaticMarkup(
    <Layout>
      <p>Child content</p>
    </Layout>,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

const LAYOUTS = [["marketing", MarketingLayout]] as const;

function token(name: string): string {
  const match = css.match(new RegExp(String.raw`${name}:\s*([^;]+);`));
  if (!match) throw new Error(`Missing CSS token ${name}`);
  return match[1].trim();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("accessible base shell", () => {
  it("root layout is the document shell: <html lang=en> wrapping the child", () => {
    const doc = renderRoot();
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
    expect(doc.body.textContent).toContain("Child content");
    // Chrome (header, skip link, main) belongs to the route-group layouts.
    expect(doc.querySelector("main")).toBeNull();
  });

  describe.each(LAYOUTS)("%s layout", (_name, Layout) => {
    it("renders one banner header with the brand and the page in a single main", () => {
      const doc = renderWith(Layout);
      const header = doc.querySelector("header");
      expect(header).not.toBeNull();
      expect(header?.textContent).toContain(SITE.name);
      expect(doc.querySelectorAll("header")).toHaveLength(1);
      expect(doc.querySelectorAll("main")).toHaveLength(1);
      expect(doc.querySelector("main")?.textContent).toContain("Child content");
    });

    it("offers a skip link that targets the main landmark", () => {
      const doc = renderWith(Layout);
      const skip = doc.querySelectorAll("a.skip-link");
      expect(skip).toHaveLength(1);
      expect(skip[0].getAttribute("href")).toBe("#main-content");
      expect(doc.querySelector("main")?.getAttribute("id")).toBe("main-content");
    });
  });

  it("sets --font-base to at least 18px", () => {
    expect(token("--font-base")).toMatch(/^\d+(\.\d+)?px$/);
    expect(parseFloat(token("--font-base"))).toBeGreaterThanOrEqual(18);
  });

  it("sets a minimum interactive size of at least 48px", () => {
    expect(parseFloat(token("--min-target"))).toBeGreaterThanOrEqual(48);
  });

  it("uses WCAG AA contrast for text and primary button colors", () => {
    expect(contrast(token("--color-text"), token("--color-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-text-muted"), token("--color-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-on-primary"), token("--color-primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-focus"), token("--color-bg"))).toBeGreaterThanOrEqual(3);
  });

  it("uses WCAG AA contrast for the marketing accent colours", () => {
    const accent = token("--color-accent");
    expect(contrast(accent, token("--color-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent, token("--color-bg-alt"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-on-accent"), accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-on-accent"), token("--color-accent-dark"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-primary"), token("--color-bg-alt"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-text-muted"), token("--color-bg-alt"))).toBeGreaterThanOrEqual(4.5);
  });
});
