import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout from "@/app/layout";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function renderLayout() {
  const html = renderToStaticMarkup(
    <RootLayout>
      <p>Child content</p>
    </RootLayout>,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

function token(name: string): string {
  const match = css.match(new RegExp(`${name}:\s*([^;]+);`));
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
  it("renders a header landmark with the portal name and the page in main", () => {
    const doc = renderLayout();
    const header = doc.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("Training Portal");
    expect(doc.querySelector("main")?.textContent).toContain("Child content");
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
  });

  it("offers a skip link that targets the main landmark", () => {
    const doc = renderLayout();
    const skip = doc.querySelector("a.skip-link");
    expect(skip?.getAttribute("href")).toBe("#main-content");
    expect(doc.querySelector("main")?.getAttribute("id")).toBe("main-content");
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
});
