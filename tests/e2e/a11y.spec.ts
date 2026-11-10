import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { availableDays } from "../../lib/booking-availability";
import { formatDate, formatTimeRange } from "../../lib/format";

/**
 * End-to-end accessibility pass over every screen, for a 60+ audience.
 *
 * For each screen (and each dialog / error state reachable from it) this runs
 * axe-core and requires zero serious or critical violations, then walks the page
 * with the Tab key and requires that every interactive control is reachable, has
 * a visible focus indicator and is at least 48x48 CSS px.
 *
 * Visitors have no accounts: they request a session from the calendar on /book,
 * and the trainer confirms or cancels it at /admin. Where a screen needs data
 * (a time taken in the meantime, a booking to confirm), the privileged
 * service-role API seeds it and the test removes it afterwards; the trainer
 * signs in through the real emailed-code screen.
 */

function envVar(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env.local`);
  return line.slice(name.length + 1).trim();
}

const supabaseUrl = envVar("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = envVar("SUPABASE_SERVICE_ROLE_KEY");
const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(request: APIRequestContext, table: string, row: object) {
  const res = await request.post(`${supabaseUrl}/rest/v1/${table}`, {
    headers: adminHeaders,
    data: row,
  });
  expect(res.ok(), `insert into ${table}: ${await res.text()}`).toBeTruthy();
  return (await res.json())[0] as { id: string };
}

/**
 * Waits for running animations and transitions (the hero and page headers fade
 * in; buttons ease between hover colours), so colours are measured as they end.
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
}

/** Fails with a readable list if axe finds any serious or critical violation. */
async function expectNoSeriousViolations(page: Page, state: string) {
  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = serious.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => ({
      target: n.target.join(" "),
      detail: n.any.concat(n.all, n.none).map((c) => c.message).join(" | "),
    })),
  }));
  expect(summary, `serious/critical axe violations on ${state}`).toEqual([]);
}

/**
 * WCAG contrast ratio of an element's text colour against its own background
 * colour (these controls and dialogs paint a solid background). axe reports the
 * dialog text as "needs review" because the modal backdrop overlaps the page, and
 * the danger button is the known watch-item, so both are checked explicitly.
 */
async function contrastRatio(locator: ReturnType<Page["locator"]>): Promise<number> {
  await settle(locator.page());
  return locator.evaluate((el) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    // Walk up to the first non-transparent background.
    let bg = [255, 255, 255];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0)) {
        bg = c;
        break;
      }
    }
    const fg = parse(getComputedStyle(el).color);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
}

type FocusStop = {
  label: string;
  width: number;
  height: number;
  outlineStyle: string;
  outlineWidth: number;
  outlineColor: string;
  boxShadow: string;
  /** True when this exact element was already focused earlier in the walk. */
  revisited: boolean;
};

/**
 * Presses Tab until focus wraps around, recording each focused control. Focus may
 * start mid-page (a screen moves it to its heading or first field), so the walk
 * carries on through the end of the document and back to the top.
 */
async function tabThrough(page: Page, maxStops = 80): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  // Clear markers from any earlier walk on this page so a second call works.
  await page.evaluate(() =>
    document.querySelectorAll("[data-tab-seen]").forEach((e) => e.removeAttribute("data-tab-seen")),
  );
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      // Next's dev-mode overlay host is not part of the app.
      if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null;
      // A radio's tap target is the label card wrapped around it, so measure that.
      const wrapping = (el as HTMLInputElement).type === "radio" ? el.closest("label") : null;
      const rect = (wrapping ?? el).getBoundingClientRect();
      const style = getComputedStyle(el);
      const label =
        el.getAttribute("aria-label") ||
        (el as HTMLInputElement).labels?.[0]?.textContent ||
        el.textContent?.replace(/\s+/g, " ").trim() ||
        el.tagName;
      // Mark elements so wrap-around is detected by identity: labels can repeat
      // (the home page has "Client login" in the nav, hero and footer).
      const revisited = el.hasAttribute("data-tab-seen");
      el.setAttribute("data-tab-seen", "");
      return {
        revisited,
        label: `${el.tagName.toLowerCase()}: ${label}`,
        width: rect.width,
        height: rect.height,
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });
    // Focus left the document (to the browser's own controls): the next Tab starts over.
    if (!stop) continue;
    if (stop.revisited) break; // wrapped around
    stops.push(stop);
  }
  return stops;
}

/** The controls a keyboard user must be able to reach: visible, enabled, in the open layer. */
async function expectedControls(page: Page, scope = "body"): Promise<number> {
  return page.locator(scope).evaluate((root) => {
    const dialog = root.querySelector("dialog[open]");
    const container = (dialog ?? root) as HTMLElement;
    const radioGroups = new Set<string>();
    return Array.from(
      container.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
    ).filter((el) => {
      if ((el as HTMLButtonElement).disabled) return false;
      // A radio group is one Tab stop; the arrow keys move within it.
      if ((el as HTMLInputElement).type === "radio") {
        const name = (el as HTMLInputElement).name;
        if (radioGroups.has(name)) return false;
        radioGroups.add(name);
      }
      // Deliberately out of the tab order and hidden from everyone (the contact form's spam trap).
      if (el.getAttribute("tabindex") === "-1" && el.closest('[aria-hidden="true"]')) return false;
      if (!dialog && el.closest("dialog")) return false; // closed dialogs are not rendered
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
    }).length;
  });
}

/** Every control is reachable by Tab, shows a visible focus ring and is at least 48x48. */
async function expectKeyboardAndTargets(page: Page, state: string) {
  const expected = await expectedControls(page); // includes the skip link when not in a dialog
  const stops = await tabThrough(page);
  expect(stops.length, `${state}: Tab should reach every control`).toBeGreaterThanOrEqual(expected);
  expect(stops.length, `${state}: at least one control`).toBeGreaterThan(0);

  for (const stop of stops) {
    const where = `${state}: "${stop.label}"`;
    expect(stop.height, `${where} height`).toBeGreaterThanOrEqual(48);
    expect(stop.width, `${where} width`).toBeGreaterThanOrEqual(48);
    const hasOutline =
      stop.outlineStyle !== "none" &&
      stop.outlineWidth >= 2 &&
      stop.outlineColor !== "rgba(0, 0, 0, 0)";
    const hasShadow = stop.boxShadow !== "none";
    expect(hasOutline || hasShadow, `${where} has a visible focus indicator`).toBe(true);
  }
}

test.describe("/ (public home page)", () => {
  test("no serious axe violations, keyboard reachable, 48px targets, visible focus", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, "/ (home)");
    await expectKeyboardAndTargets(page, "/ (home)");
  });

  test("has one banner, one main, one h1, a skip link and a preview section linking to each page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('a.skip-link[href="#main-content"]')).toHaveCount(1);
    for (const id of ["about", "pricing", "gallery", "testimonials", "contact"]) {
      await expect(page.locator(`section[aria-labelledby="${id}-title"] h2`)).toHaveCount(1);
    }
    const main = page.locator("main#main-content");
    for (const [name, href] of [
      ["Read more about Jervaughn", "/about"],
      ["See pricing details", "/pricing"],
      ["Read more testimonials", "/testimonials"],
      ["Get in touch with Jervaughn", "/contact"],
    ]) {
      await expect(main.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    // Every package price is on the home page; the photo grid has every photo.
    for (const price of ["$85", "$400", "$750", "$1,050", "$120", "$425", "$785", "$1,125"]) {
      await expect(main.locator(".price-total", { hasText: price })).toHaveCount(1);
    }
    await expect(main.locator(".gallery-button")).toHaveCount(5);
  });

  test("a gallery photo opens larger in a dialog and closes again", async ({ page }) => {
    await page.goto("/");
    const first = page.locator(".gallery-button").first();
    await first.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img")).toBeVisible();
    await dialog.getByRole("button", { name: "Close photo" }).click();
    await expect(dialog).toBeHidden();
    await first.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("phone width (375px): no horizontal scroll, controls still 48px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);
    await expectNoSeriousViolations(page, "/ (home, 375px)");
    await expectKeyboardAndTargets(page, "/ (home, 375px)");
  });

  test("the nav links to the real pages and the Book a session button goes to /book", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const [name, href] of PUBLIC_NAV) {
      await expect(nav.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("banner").getByRole("link", { name: "Book a session" }).click();
    await expect(page).toHaveURL(/\/book$/);
    await expect(page.getByRole("heading", { level: 1, name: "Book a session" })).toBeVisible();
    // The brand name is the way back to the home page.
    await page.getByRole("banner").getByRole("link", { name: "My Older Fitness" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

const PUBLIC_NAV = [
  ["Home", "/"],
  ["About", "/about"],
  ["Pricing", "/pricing"],
  ["Testimonials", "/testimonials"],
  ["Contact", "/contact"],
] as const;

const PUBLIC_PAGES = [
  { path: "/about", nav: "About", h1: /^About /, title: /^About .+ \| My Older Fitness$/ },
  { path: "/pricing", nav: "Pricing", h1: "Session prices", title: /^Pricing \| / },
  { path: "/testimonials", nav: "Testimonials", h1: "What clients say", title: /^Testimonials \| / },
  { path: "/contact", nav: "Contact", h1: "Get in touch", title: /^Contact \| / },
] as const;

/** The contact form's submit button is disabled until the page has hydrated. */
async function waitForInteractive(page: Page) {
  for (const button of await page.getByRole("button", { name: "Send message" }).all()) {
    await expect(button).toBeEnabled();
  }
}

for (const { path, nav, h1, title } of PUBLIC_PAGES) {
  test.describe(`${path} (public page)`, () => {
    test("own h1 and title, landmarks, aria-current, axe, keyboard, 48px targets, focus", async ({ page }) => {
      await page.goto(path);
      await waitForInteractive(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
      await expect(page.locator("main#main-content")).toHaveCount(1);
      await expect(page.locator("header")).toHaveCount(1);
      await expect(page.locator("footer")).toHaveCount(1);
      await expect(page.locator('a.skip-link[href="#main-content"]')).toHaveCount(1);
      // The current page is marked in the header and footer navs, and only there.
      const current = page.locator('[aria-current="page"]');
      await expect(current).toHaveCount(2);
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: nav })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expectNoSeriousViolations(page, `${path}`);
      await expectKeyboardAndTargets(page, `${path}`);
    });

    test("phone width (375px): no horizontal scroll, controls still 48px", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(path);
      await waitForInteractive(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);
      await expectNoSeriousViolations(page, `${path} (375px)`);
      await expectKeyboardAndTargets(page, `${path} (375px)`);
    });
  });
}

test.describe("/privacy (public page, footer only)", () => {
  test("own h1 and title, marked current in the footer, axe, keyboard, 48px targets, focus", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your privacy");
    await expect(page).toHaveTitle(/^Privacy \| /);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    // Not in the main nav, so only the footer link is marked current.
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Privacy" }),
    ).toHaveAttribute("aria-current", "page");
    await expectNoSeriousViolations(page, "/privacy");
    await expectKeyboardAndTargets(page, "/privacy");
  });

  test("phone width (375px): no horizontal scroll, controls still 48px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);
    await expectNoSeriousViolations(page, "/privacy (375px)");
    await expectKeyboardAndTargets(page, "/privacy (375px)");
  });

  test("the contact form links to it", async ({ page }) => {
    await page.goto("/contact");
    await page.locator("main#main-content form").getByRole("link", { name: "How we use your details" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});

test.describe("public page content and links", () => {
  test("contact publishes no email or phone, and the form posts to the server, never the URL", async ({ page }) => {
    await page.goto("/contact");
    const main = page.locator("main#main-content");
    await expect(page.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);
    await expect(main.getByLabel("Your name")).toBeVisible();
    await expect(main.getByLabel("Your email")).toBeVisible();
    await expect(main.getByLabel("Your message")).toBeVisible();
    const requests: { method: string; url: string }[] = [];
    page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
    const submit = main.getByRole("button", { name: "Send message" });
    await expect(submit).toBeEnabled();
    await main.getByLabel("Your name").fill("Pat Example");
    await main.getByLabel("Your email").fill("pat@example.com");
    await main.getByLabel("Your message").fill("I would like to start training.");
    await submit.click();
    // Sent (thank-you) or, with no mail server in the test run, a clear error.
    await expect(main.getByRole("status").or(main.getByRole("alert"))).toBeVisible();
    await expect(page).toHaveURL(/\/contact$/);
    expect(requests.filter((r) => r.method === "POST").length).toBeGreaterThan(0);
    expect(requests.filter((r) => r.url.includes("Pat") || r.url.includes("/contact?"))).toEqual([]);
  });

  test("booking shows the price range and links to pricing", async ({ page }) => {
    await page.goto("/book");
    const note = page.locator(".booking-price-note");
    await expect(note).toContainText("$70");
    await expect(note).toContainText("$85");
    await expect(note).toContainText("$120");
    await expect(note.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
  });

  test("without JavaScript the form cannot be submitted, so nothing personal reaches the URL", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto("/contact");
    const main = page.locator("main#main-content");
    await expect(main.getByRole("button", { name: "Send message" })).toBeDisabled();
    await main.getByLabel("Your name").fill("Pat Example");
    await main.getByLabel("Your message").fill("Private words");
    await main.getByLabel("Your name").press("Enter"); // implicit submission must be blocked too
    await expect(page).toHaveURL(/\/contact$/);
    expect(urls.filter((u) => u.includes("/contact?") || u.includes("Pat"))).toEqual([]);
    expect(await main.locator("form").getAttribute("method")).toBe("post");
    await context.close();
  });
});

test.describe("public 404", () => {
  test("an unknown public path shows the site chrome: landmarks, axe, keyboard, targets", async ({ page }) => {
    const res = await page.goto("/medico");
    expect(res?.status()).toBe(404);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.locator('a.skip-link[href="#main-content"]')).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the home page" })).toBeVisible();
    await expectNoSeriousViolations(page, "/medico (404)");
    await expectKeyboardAndTargets(page, "/medico (404)");
  });
});

/** Opens /book and waits for the calendar's open days (worked out after load). */
async function openBookingCalendar(page: Page) {
  await page.goto("/book");
  await expect(page.getByRole("heading", { level: 1, name: "Book a session" })).toBeVisible();
  const days = page.locator("button.booking-day--open");
  await expect(days.first()).toBeVisible();
  return days;
}

const SESSION_TYPE_LABEL = { "one-on-one": /^1-on-1 training/, partner: /^Partner training/ } as const;

/** The "What kind of session" radio group at the top of /book. */
const sessionTypeGroup = (page: Page) => page.getByRole("group", { name: "What kind of session would you like?" });

/**
 * Chooses a session type (unless `type` is null), then picks the first open
 * day and its first time, so the details form shows. Returns the chosen slot's
 * real start and end, matched by the labels the page shows (so a test can
 * take that exact time in the meantime).
 */
async function pickFirstTime(page: Page, type: keyof typeof SESSION_TYPE_LABEL | null = "one-on-one") {
  const days = await openBookingCalendar(page);
  if (type) await sessionTypeGroup(page).getByRole("radio", { name: SESSION_TYPE_LABEL[type] }).check();
  const dayLabel = (await days.first().getAttribute("aria-label"))!;
  await days.first().click();
  const time = page.locator(".booking-times").getByRole("button").first();
  const timeLabel = (await time.textContent())!.trim();
  await time.click();
  await expect(page.getByRole("form", { name: "Your details" })).toBeVisible();
  const date = dayLabel.split(" — ")[0];
  const slot = availableDays(new Date())
    .flatMap((day) => day.slots)
    .find((s) => formatDate(s.startsAt) === date && formatTimeRange(s.startsAt, s.endsAt) === timeLabel);
  expect(slot, `slot for ${date}, ${timeLabel}`).toBeTruthy();
  return slot!;
}

/** Fills the details form with a tagged test address and sends the request. */
async function requestTime(page: Page, email: string) {
  const form = page.getByRole("form", { name: "Your details" });
  await form.getByLabel("Your name").fill("Pat Example");
  await form.getByLabel("Your email address").fill(email);
  await form.getByRole("button", { name: "Request this session" }).click();
}

test.describe("/book (booking calendar)", () => {
  // Requests made through the page, and any seeded in the meantime, are removed by address.
  const emails: string[] = [];
  const testEmail = () => {
    const email = `a11y-book-${randomUUID()}@example.com`;
    emails.push(email);
    return email;
  };

  test.afterEach(async ({ request }) => {
    for (const email of emails) {
      await request.delete(`${supabaseUrl}/rest/v1/booking_requests?email=eq.${encodeURIComponent(email)}`, {
        headers: adminHeaders,
      });
    }
    emails.length = 0;
  });

  test("calendar: own h1 and title, landmarks, axe, keyboard, 48px targets, focus", async ({ page }) => {
    await openBookingCalendar(page);
    await expect(page).toHaveTitle(/^Book a session \| /);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.locator('a.skip-link[href="#main-content"]')).toHaveCount(1);
    await expect(page.getByRole("table")).toBeVisible();
    await expectNoSeriousViolations(page, "/book (calendar)");
    await expectKeyboardAndTargets(page, "/book (calendar)");
  });

  test("phone width (375px): no horizontal scroll, controls still 48px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openBookingCalendar(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "page must not scroll sideways").toBeLessThanOrEqual(0);
    await expectNoSeriousViolations(page, "/book (375px)");
    await expectKeyboardAndTargets(page, "/book (375px)");
  });

  test("a day picked: its times are listed, axe, keyboard, 48px targets, focus", async ({ page }) => {
    const days = await openBookingCalendar(page);
    await days.first().click();
    await expect(days.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { level: 2, name: /^Times on / })).toBeVisible();
    await expectNoSeriousViolations(page, "/book (times)");
    await expectKeyboardAndTargets(page, "/book (times)");
  });

  test("a time picked: the details form, axe, keyboard, 48px targets, focus", async ({ page }) => {
    await pickFirstTime(page);
    const form = page.getByRole("form", { name: "Your details" });
    for (const label of ["Your name", "Your email address", "Your phone number (optional)"]) {
      await expect(form.getByLabel(label)).toBeVisible();
    }
    await expectNoSeriousViolations(page, "/book (details form)");
    await expectKeyboardAndTargets(page, "/book (details form)");
  });

  test("after requesting a time (thank-you): axe, keyboard, 48px targets, focus", async ({ page }) => {
    await pickFirstTime(page);
    await requestTime(page, testEmail());
    await expect(page.getByRole("heading", { level: 1, name: "Thank you — your request is in" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("This is a request, not a confirmed booking yet");
    await expectNoSeriousViolations(page, "/book (thank-you)");
    await expectKeyboardAndTargets(page, "/book (thank-you)");
  });

  test("booking another session: details kept, focus follows, cap after three, axe, keyboard, 48px targets", async ({ page }) => {
    const email = testEmail();
    await pickFirstTime(page);
    await requestTime(page, email);
    const thanks = page.getByRole("heading", { level: 1, name: /^Thank you — your request/ });
    await expect(thanks).toBeFocused();
    const another = page.getByRole("button", { name: "Book another session" });
    await expect(another).toBeVisible();

    for (let booked = 1; booked < 3; booked++) {
      await another.click();
      await expect(page.getByRole("heading", { level: 1, name: "Book a session" })).toBeFocused();
      await sessionTypeGroup(page).getByRole("radio", { name: SESSION_TYPE_LABEL.partner }).check();
      const days = page.locator("button.booking-day--open");
      await days.first().click();
      await page.locator(".booking-times").getByRole("button").first().click();
      const form = page.getByRole("form", { name: "Your details" });
      await expect(form.getByLabel("Your name")).toHaveValue("Pat Example");
      await expect(form.getByLabel("Your email address")).toHaveValue(email);
      if (booked === 1) {
        await expectNoSeriousViolations(page, "/book (booking another, details form)");
        await expectKeyboardAndTargets(page, "/book (booking another, details form)");
      }
      await form.getByRole("button", { name: "Request this session" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Thank you — your requests are in" })).toBeFocused();
      await expect(page.getByRole("status").getByRole("listitem")).toHaveCount(booked + 1);
    }

    await expect(another).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("You have 3 requests waiting — we'll be in touch to confirm.");
    await expectNoSeriousViolations(page, "/book (three requests waiting)");
    await expectKeyboardAndTargets(page, "/book (three requests waiting)");
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length), "nothing in browser storage").toBe(0);

    // A reload starts fresh: nothing pre-filled.
    await pickFirstTime(page);
    await expect(page.getByRole("form", { name: "Your details" }).getByLabel("Your name")).toHaveValue("");
  });

  test("session type: asked first, neither chosen; axe, keyboard, 48px targets, focus", async ({ page }) => {
    await openBookingCalendar(page);
    const group = sessionTypeGroup(page);
    const radios = group.getByRole("radio");
    await expect(radios).toHaveCount(2);
    for (const radio of await radios.all()) await expect(radio).not.toBeChecked();
    await expect(group.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
    // Above the calendar.
    const groupBox = (await group.boundingBox())!;
    const calendarBox = (await page.getByRole("table").boundingBox())!;
    expect(groupBox.y + groupBox.height).toBeLessThanOrEqual(calendarBox.y);
    // Each option card is the tap target.
    for (const option of await page.locator(".session-type-option").all()) {
      expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      expect(await contrastRatio(option.locator(".session-type-intro")), "session type intro").toBeGreaterThanOrEqual(4.5);
    }
    await expectNoSeriousViolations(page, "/book (session type)");
    await expectKeyboardAndTargets(page, "/book (session type)");
  });

  for (const type of ["one-on-one", "partner"] as const) {
    test(`choosing ${type} saves it with the request`, async ({ page, request }) => {
      const email = testEmail();
      await pickFirstTime(page, type);
      const radio = sessionTypeGroup(page).getByRole("radio", { name: SESSION_TYPE_LABEL[type] });
      await expect(radio).toBeChecked();
      const option = page
        .locator(".session-type-option")
        .filter({ has: page.getByRole("radio", { name: SESSION_TYPE_LABEL[type] }) });
      expect(await contrastRatio(option.locator(".session-type-intro")), "chosen intro").toBeGreaterThanOrEqual(4.5);
      await expectNoSeriousViolations(page, `/book (${type} chosen)`);
      await requestTime(page, email);
      await expect(page.getByRole("heading", { level: 1, name: "Thank you — your request is in" })).toBeVisible();

      const res = await request.get(
        `${supabaseUrl}/rest/v1/booking_requests?select=session_type&email=eq.${encodeURIComponent(email)}`,
        { headers: adminHeaders },
      );
      expect(await res.json()).toEqual([{ session_type: type }]);
    });
  }

  test("no session type chosen: message on the group, focus moves there, input kept; axe, keyboard, 48px targets", async ({ page }) => {
    await pickFirstTime(page, null);
    const form = page.getByRole("form", { name: "Your details" });
    const chosen = await page.locator(".booking-chosen").textContent();
    await form.getByLabel("Your name").fill("Pat Example");
    await form.getByLabel("Your email address").fill(testEmail());
    await form.getByRole("button", { name: "Request this session" }).click();

    const group = sessionTypeGroup(page);
    await expect(group.getByText("Please choose 1-on-1 or partner training.")).toBeVisible();
    const first = group.getByRole("radio", { name: SESSION_TYPE_LABEL["one-on-one"] });
    await expect(first).toBeFocused();
    await expect(first).toHaveAccessibleDescription("Please choose 1-on-1 or partner training.");
    await expect(form.getByLabel("Your name")).toHaveValue("Pat Example");
    await expect(page.locator(".booking-chosen")).toHaveText(chosen!);
    expect(await contrastRatio(group.locator(".error-message")), "session type error").toBeGreaterThanOrEqual(4.5);
    await expectNoSeriousViolations(page, "/book (no session type)");
    await expectKeyboardAndTargets(page, "/book (no session type)");

    // Choosing one clears the message; the request then goes through.
    await first.check();
    await expect(group.getByText("Please choose 1-on-1 or partner training.")).toHaveCount(0);
    await form.getByRole("button", { name: "Request this session" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Thank you — your request is in" })).toBeVisible();
  });

  test("a time taken in the meantime (alert): axe, keyboard, 48px targets, focus", async ({ page, request }) => {
    const slot = await pickFirstTime(page);
    // Someone else requests the same time while the form is open.
    await rest(request, "booking_requests", {
      name: "Someone Else",
      email: testEmail(),
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
    });
    await requestTime(page, testEmail());
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "Sorry, someone has just booked that time. Please choose another.",
    );
    await expectNoSeriousViolations(page, "/book (time taken alert)");
    await expectKeyboardAndTargets(page, "/book (time taken alert)");
  });
});

test.describe("/admin/sign-in", () => {
  test("email step: own h1, landmarks, axe, keyboard, 48px targets, focus", async ({ page }) => {
    await page.goto("/admin/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Trainer sign in" })).toBeVisible();
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.locator('a.skip-link[href="#main-content"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeEnabled();
    await expectNoSeriousViolations(page, "/admin/sign-in (email step)");
    await expectKeyboardAndTargets(page, "/admin/sign-in (email step)");
  });

  test("code step and a wrong-code error: axe, keyboard, 48px targets, focus", async ({ page }) => {
    await page.goto("/admin/sign-in");
    await page.getByLabel("Your email address").fill(`a11y-signin-${randomUUID()}@example.com`);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByLabel("Code from your email")).toBeFocused();
    await expectNoSeriousViolations(page, "/admin/sign-in (code step)");
    await expectKeyboardAndTargets(page, "/admin/sign-in (code step)");

    await page.getByLabel("Code from your email").fill("000000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#signin-error")).toBeVisible();
    await expect(page.getByLabel("Code from your email")).toHaveAttribute("aria-invalid", "true");
    await expectNoSeriousViolations(page, "/admin/sign-in (wrong code error)");
    await expectKeyboardAndTargets(page, "/admin/sign-in (wrong code error)");
  });
});

test.describe("colour contrast of controls axe cannot fully judge", () => {
  test("calendar days, time rows and the request button meet AA (4.5:1), also on hover and when picked", async ({ page }) => {
    const days = await openBookingCalendar(page);
    const day = days.first();
    expect(await contrastRatio(day), "open day").toBeGreaterThanOrEqual(4.5);
    await day.hover();
    expect(await contrastRatio(day), "open day, hover").toBeGreaterThanOrEqual(4.5);
    await day.click();
    expect(await contrastRatio(day), "picked day").toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(page.locator(".booking-month-title")), "month heading").toBeGreaterThanOrEqual(4.5);

    const row = page.locator(".booking-times").getByRole("button").first();
    expect(await contrastRatio(row.locator(".slot-time")), "time row").toBeGreaterThanOrEqual(4.5);
    await row.hover();
    expect(await contrastRatio(row.locator(".slot-time")), "time row, hover").toBeGreaterThanOrEqual(4.5);
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    expect(await contrastRatio(row.locator(".slot-time")), "picked time row").toBeGreaterThanOrEqual(4.5);

    const submit = page.getByRole("button", { name: "Request this session" });
    expect(await contrastRatio(submit), "request button").toBeGreaterThanOrEqual(4.5);
    await submit.hover();
    expect(await contrastRatio(submit), "request button, hover").toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(page.locator(".booking-chosen strong").first()), "chosen time").toBeGreaterThanOrEqual(4.5);
  });

  test("the header Book a session button stays readable on hover", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("banner").getByRole("link", { name: "Book a session" });
    expect(await contrastRatio(cta)).toBeGreaterThanOrEqual(4.5);
    await cta.hover();
    expect(await contrastRatio(cta)).toBeGreaterThanOrEqual(4.5);
  });

  test("error messages meet AA (4.5:1)", async ({ page }) => {
    await page.goto("/admin/sign-in");
    await page.getByLabel("Your email address").fill(`a11y-contrast-${randomUUID()}@example.com`);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await page.getByLabel("Code from your email").fill("000000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#signin-error")).toBeVisible();
    expect(await contrastRatio(page.locator("#signin-error"))).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("/admin confirm and cancel panels", () => {
  const seeded = { bookingId: "", adminEmail: "", userId: "" };

  /**
   * Seeds an admin and one new booking request a few years out (a random hour,
   * so reruns never collide on the one-live-booking-per-time index), then signs
   * in through the real emailed-code screen.
   */
  async function signInAsAdminWithBooking(page: Page, request: APIRequestContext) {
    seeded.adminEmail = `a11y-admin-${randomUUID()}@example.com`;
    const user = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: adminHeaders,
      data: { email: seeded.adminEmail, email_confirm: true },
    });
    expect(user.ok()).toBeTruthy();
    seeded.userId = ((await user.json()) as { id: string }).id;
    await rest(request, "admins", { email: seeded.adminEmail });

    const start = new Date(Date.UTC(2033, 0, 1, 14) + Math.floor(Math.random() * 3000) * 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const booking = await rest(request, "booking_requests", {
      name: "Jordan Tester",
      email: `a11y-client-${randomUUID()}@example.com`,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      session_type: "partner",
    });
    seeded.bookingId = booking.id;

    await page.goto("/admin/sign-in");
    await page.getByLabel("Your email address").fill(seeded.adminEmail);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByLabel("Code from your email")).toBeVisible();
    const link = await request.post(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      headers: adminHeaders,
      data: { type: "magiclink", email: seeded.adminEmail },
    });
    expect(link.ok()).toBeTruthy();
    await page.getByLabel("Code from your email").fill((await link.json()).email_otp as string);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
  }

  test.afterEach(async ({ request }) => {
    if (seeded.bookingId) {
      await request.delete(`${supabaseUrl}/rest/v1/booking_requests?id=eq.${seeded.bookingId}`, {
        headers: adminHeaders,
      });
    }
    if (seeded.adminEmail) {
      await request.delete(`${supabaseUrl}/rest/v1/admins?email=eq.${encodeURIComponent(seeded.adminEmail)}`, {
        headers: adminHeaders,
      });
    }
    if (seeded.userId) {
      await request.delete(`${supabaseUrl}/auth/v1/admin/users/${seeded.userId}`, { headers: adminHeaders });
    }
    seeded.bookingId = seeded.adminEmail = seeded.userId = "";
  });

  test("open panel: no serious axe violations, focus moves in and back, 48px targets, visible focus", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    const card = page.locator(".admin-booking").filter({ hasText: "Jordan Tester" });
    // The session type sits beside the name, in words.
    await expect(card.locator(".session-type-tag")).toHaveText("Partner");
    expect(await contrastRatio(card.locator(".session-type-tag")), "session type tag").toBeGreaterThanOrEqual(4.5);
    const confirm = card.getByRole("button", { name: /^Confirm the booking for Jordan Tester/ });
    await confirm.click();

    const panel = card.getByRole("form", { name: /^Confirm Jordan's booking on .+ at .+\?$/ });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("They'll get a confirmation email.");
    // Focus lands on the question, so the panel is announced.
    await expect(panel.locator(".confirm-panel-question")).toBeFocused();

    await expectNoSeriousViolations(page, "/admin (confirm panel)");

    // Tab walks the panel's own controls in order, each 48px with a focus ring.
    const expected = ["Don't email the client", "Note for Jordan (optional)", "Yes, confirm and email Jordan", "Not yet"];
    for (const name of expected) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        // A checkbox's tap target is its row: the box and its 48px label together.
        const target = (el as HTMLInputElement).type === "checkbox" ? (el.closest(".check-field") ?? el) : el;
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          label: (el as HTMLTextAreaElement).labels?.[0]?.textContent ?? el.textContent ?? "",
          width: rect.width,
          height: rect.height,
          outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
        };
      });
      expect(stop.label.trim()).toBe(name);
      expect(stop.height, `${name} height`).toBeGreaterThanOrEqual(48);
      expect(stop.width, `${name} width`).toBeGreaterThanOrEqual(48);
      expect(stop.outline, `${name} focus ring`).toBe(true);
    }

    // "Not yet" closes the panel and returns focus to Confirm.
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    await expect(confirm).toBeFocused();
  });

  test("confirming with a note: the booking is confirmed and the result is announced", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    const card = page.locator(".admin-booking").filter({ hasText: "Jordan Tester" });
    await card.getByRole("button", { name: /^Confirm the booking for Jordan Tester/ }).click();
    await card.getByLabel("Note for Jordan (optional)").fill("Let's meet at Oakledge Park, by the main pavilion.");
    await card.getByRole("button", { name: "Yes, confirm and email Jordan" }).click();

    await expect(card.locator(".status-badge")).toHaveText("Confirmed");
    // Emailed (local mail viewer) or, if mail is not set up, the warning: either is announced.
    const result = card.locator(".notice-message, .warning-message");
    await expect(result).toHaveText(
      /^(Confirmed\. Jordan has been emailed\.|Confirmed, but the email to Jordan didn't send\. Please call or email them yourself\.)$/,
    );
    await expect(result).toBeFocused();
    await expectNoSeriousViolations(page, "/admin (after confirming)");
  });

  test("open cancel panel: no browser pop-up, no serious axe violations, focus in and back, 48px targets, visible focus", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    // The old window.confirm() pop-up must be gone: fail if any dialog appears.
    page.on("dialog", (dialog) => {
      throw new Error(`Unexpected browser pop-up: ${dialog.message()}`);
    });
    const card = page.locator(".admin-booking").filter({ hasText: "Jordan Tester" });
    const cancel = card.getByRole("button", { name: /^Cancel the booking for Jordan Tester/ });
    await cancel.click();

    const panel = card.getByRole("form", { name: /^Cancel Jordan's booking on .+ at .+\?$/ });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("They'll get an email letting them know.");
    await expect(panel.locator(".confirm-panel-question")).toBeFocused();

    await expectNoSeriousViolations(page, "/admin (cancel panel)");

    const expected = [
      "Don't email the client",
      "Reason (optional, included in the email)",
      "Yes, cancel and email Jordan",
      "Keep booking",
    ];
    for (const name of expected) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        // A checkbox's tap target is its row: the box and its 48px label together.
        const target = (el as HTMLInputElement).type === "checkbox" ? (el.closest(".check-field") ?? el) : el;
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          label: (el as HTMLTextAreaElement).labels?.[0]?.textContent ?? el.textContent ?? "",
          width: rect.width,
          height: rect.height,
          outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
        };
      });
      expect(stop.label.trim()).toBe(name);
      expect(stop.height, `${name} height`).toBeGreaterThanOrEqual(48);
      expect(stop.width, `${name} width`).toBeGreaterThanOrEqual(48);
      expect(stop.outline, `${name} focus ring`).toBe(true);
    }

    // "Keep booking" closes the panel, returns focus to Cancel, and changes nothing.
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    await expect(cancel).toBeFocused();
    await expect(card.locator(".status-badge")).toHaveText("New request");
  });

  test("cancelling a confirmed booking with a reason: it is cancelled and the result is announced", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    const card = page.locator(".admin-booking").filter({ hasText: "Jordan Tester" });
    await card.getByRole("button", { name: /^Confirm the booking for Jordan Tester/ }).click();
    await card.getByRole("button", { name: "Yes, confirm and email Jordan" }).click();
    await expect(card.locator(".status-badge")).toHaveText("Confirmed");

    await card.getByRole("button", { name: /^Cancel the booking for Jordan Tester/ }).click();
    await card.getByLabel("Reason (optional, included in the email)").fill("I'm unwell this week, sorry.");
    await card.getByRole("button", { name: "Yes, cancel and email Jordan" }).click();

    await expect(card.locator(".status-badge")).toHaveText("Cancelled");
    const result = card.locator(".notice-message, .warning-message");
    await expect(result).toHaveText(
      /^(Cancelled\. Jordan has been emailed\.|Cancelled, but the email to Jordan didn't send\. Please call or email them yourself\.)$/,
    );
    await expect(result).toBeFocused();
    await expectNoSeriousViolations(page, "/admin (after cancelling)");
  });

  /** Admin bookings these tests add carry this in the name, so cleanup can find them (they may have no email). */
  const ADDED_MARK = "e2e-added";

  test.afterEach(async ({ request }) => {
    await request.delete(`${supabaseUrl}/rest/v1/booking_requests?name=like.*${ADDED_MARK}*`, {
      headers: adminHeaders,
    });
  });

  /** A gym-zone date ("YYYY-MM-DD") and time ("HH:MM") for an instant, as the form takes them. */
  function gymDateTime(iso: string) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
    return { date, time };
  }

  async function openAddBooking(page: Page) {
    await page.getByRole("button", { name: "Add a booking" }).click();
    const form = page.getByRole("form", { name: "Add a booking" });
    await expect(form).toBeVisible();
    await expect(form.getByRole("heading", { name: "Add a booking" })).toBeFocused();
    return form;
  }

  test("add a booking: a closed day at 10:15 for 45 minutes with only a name; axe, keyboard, 48px targets, focus", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    const form = await openAddBooking(page);
    await expect(form.getByLabel("Length")).toHaveValue("60");
    await expectNoSeriousViolations(page, "/admin (add a booking form)");

    // Tab walks the form's own controls in order, each 48px with a focus ring.
    // (The date input takes one Tab each for month, day and year.)
    const expected = [
      "Client's name",
      "Date",
      "Start time",
      "Length",
      "Email (optional)",
      "Phone (optional)",
      "Note (optional)",
      "Save booking",
      "Close",
    ];
    const reached: string[] = [];
    for (let i = 0; i < 20 && reached.length < expected.length; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          label: ((el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "").trim(),
          width: rect.width,
          height: rect.height,
          outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (reached.at(-1) === stop.label) continue;
      reached.push(stop.label);
      expect(stop.height, `${stop.label} height`).toBeGreaterThanOrEqual(48);
      expect(stop.width, `${stop.label} width`).toBeGreaterThanOrEqual(48);
      expect(stop.outline, `${stop.label} focus ring`).toBe(true);
    }
    expect(reached).toEqual(expected);

    // "Close" returns focus to Add a booking; reopen to fill it in.
    await page.keyboard.press("Enter");
    await expect(form).toBeHidden();
    await expect(page.getByRole("button", { name: "Add a booking" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(form.getByRole("heading", { name: "Add a booking" })).toBeFocused();

    // A Tuesday (closed on the public schedule), years out and random so reruns never collide.
    let day = new Date(Date.UTC(2036, 0, 1, 12) + Math.floor(Math.random() * 3000) * 86_400_000);
    while (day.getUTCDay() !== 2) day = new Date(day.getTime() + 86_400_000);
    const name = `Pat ${ADDED_MARK}-${randomUUID().slice(0, 8)}`;
    await form.getByLabel("Client's name").fill(name);
    await form.getByLabel("Date").fill(day.toISOString().slice(0, 10));
    await form.getByLabel("Start time").selectOption("10:15");
    await form.getByLabel("Length").selectOption("45");
    await form.getByRole("button", { name: "Save booking" }).click();

    const status = page.getByRole("status").filter({ hasText: "Added Pat's session on" });
    await expect(status).toHaveText(/^Added Pat's session on Tuesday, .+ at 10:15 AM\.$/);
    await expect(status).toBeFocused();
    await expect(form).toBeHidden();

    const card = page.locator(".admin-booking").filter({ hasText: name });
    await expect(card.locator(".source-tag")).toHaveText("Added by you");
    // No session type recorded, so no type tag.
    await expect(card.locator(".session-type-tag")).toHaveCount(0);
    await expect(card.locator(".status-badge")).toHaveText("Confirmed");
    await expect(card).toContainText("No email given");
    await expect(card).toContainText("10:15 AM to 11:00 AM");
    await expect(card.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expectNoSeriousViolations(page, "/admin (after adding a booking)");
    expect(await contrastRatio(card.locator(".source-tag")), "Added by you tag").toBeGreaterThanOrEqual(4.5);

    // With no email on file, cancelling says so instead of offering to email.
    await card.getByRole("button", { name: /^Cancel the booking for Pat/ }).click();
    await expect(card.getByRole("form")).toContainText("No email on file — let them know yourself.");
    await card.getByRole("button", { name: "Yes, cancel" }).click();
    await expect(card.locator(".status-badge")).toHaveText("Cancelled");
  });

  test("add a booking: an exact clash is blocked; an overlap warns and can be saved anyway", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    const row = await request.get(`${supabaseUrl}/rest/v1/booking_requests?id=eq.${seeded.bookingId}&select=starts_at`, {
      headers: adminHeaders,
    });
    const [{ starts_at }] = (await row.json()) as { starts_at: string }[];
    const at = gymDateTime(starts_at);
    const quarterPast = gymDateTime(new Date(Date.parse(starts_at) + 15 * 60_000).toISOString());

    const form = await openAddBooking(page);
    const name = `Sam ${ADDED_MARK}-${randomUUID().slice(0, 8)}`;
    await form.getByLabel("Client's name").fill(name);
    await form.getByLabel("Date").fill(at.date);
    await form.getByLabel("Start time").selectOption(at.time);
    await form.getByRole("button", { name: "Save booking" }).click();
    await expect(form.getByRole("alert")).toHaveText("Another booking already holds that time. Please choose another.");
    await expect(form.getByRole("button", { name: "Save anyway" })).toHaveCount(0);

    await form.getByLabel("Start time").selectOption(quarterPast.time);
    await form.getByRole("button", { name: "Save booking" }).click();
    const warning = form.getByRole("alert");
    await expect(warning).toContainText(/^This overlaps Jordan's \d{1,2}:\d{2} [AP]M session\./);
    await expectNoSeriousViolations(page, "/admin (overlap warning)");
    expect(await contrastRatio(warning), "overlap warning").toBeGreaterThanOrEqual(4.5);

    await form.getByRole("button", { name: "Save anyway" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added Sam's session on" })).toBeFocused();
    await expect(page.locator(".admin-booking").filter({ hasText: name }).locator(".source-tag")).toHaveText("Added by you");
  });

  /** Tabs through the focused form, checking each stop is 48px with a focus ring; returns the labels reached. */
  async function tabThrough(page: Page, count: number) {
    const reached: string[] = [];
    for (let i = 0; i < count + 12 && reached.length < count; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          label: ((el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "").trim(),
          width: rect.width,
          height: rect.height,
          outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (reached.at(-1) === stop.label) continue;
      reached.push(stop.label);
      expect(stop.height, `${stop.label} height`).toBeGreaterThanOrEqual(48);
      expect(stop.width, `${stop.label} width`).toBeGreaterThanOrEqual(48);
      expect(stop.outline, `${stop.label} focus ring`).toBe(true);
    }
    return reached;
  }

  async function seededStart(request: APIRequestContext) {
    const row = await request.get(`${supabaseUrl}/rest/v1/booking_requests?id=eq.${seeded.bookingId}&select=starts_at`, {
      headers: adminHeaders,
    });
    const [{ starts_at }] = (await row.json()) as { starts_at: string }[];
    return Date.parse(starts_at);
  }

  test("edit a booking: details only, no email, Edited tag; axe, keyboard, 48px targets, focus", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    const card = page.locator(".admin-booking").filter({ hasText: "Jordan Tester" });
    const edit = card.getByRole("button", { name: "Edit the booking for Jordan Tester" });
    await edit.click();

    // In edit mode the name is only an input value, so find the (only) edit form on the page.
    const form = page.getByRole("form", { name: "Edit Jordan's booking" });
    await expect(form).toBeVisible();
    await expect(form.getByRole("heading", { name: "Edit Jordan's booking" })).toBeFocused();
    await expect(form.getByLabel("Client's name")).toHaveValue("Jordan Tester");
    await expect(form.getByLabel("Length")).toHaveValue("60");
    await expectNoSeriousViolations(page, "/admin (edit form)");

    expect(await tabThrough(page, 9)).toEqual([
      "Client's name",
      "Date",
      "Start time",
      "Length",
      "Email",
      "Phone (optional)",
      "Note (optional)",
      "Save changes",
      "Never mind",
    ]);

    // "Never mind" puts the card back and focus on Edit.
    await page.keyboard.press("Enter");
    await expect(form).toBeHidden();
    await expect(edit).toBeFocused();

    await edit.click();
    await form.getByLabel("Phone (optional)").fill("555 010 2030");
    await form.getByLabel("Note (optional)").fill("Bad left knee.");
    await expect(form.getByLabel("Don't email the client")).toHaveCount(0);
    await form.getByRole("button", { name: "Save changes" }).click();

    const status = card.getByRole("status");
    await expect(status).toHaveText("Saved your changes to Jordan's booking.");
    await expect(status).toBeFocused();
    await expect(card).toContainText("555 010 2030");
    await expect(card).toContainText("Bad left knee.");
    await expect(card.locator(".status-badge")).toHaveText("New request");
    const edited = card.locator(".source-tag").filter({ hasText: "Edited" });
    await expect(edited).toBeVisible();
    expect(await contrastRatio(edited), "Edited tag").toBeGreaterThanOrEqual(4.5);
    await expectNoSeriousViolations(page, "/admin (after editing)");
  });

  test("move a booking: clash blocked, overlap warns, moving a request confirms it; Don't email the client", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    const start = await seededStart(request);
    // Another booking two hours later, an hour long.
    const otherStart = start + 2 * 3_600_000;
    await rest(request, "booking_requests", {
      name: `Sam ${ADDED_MARK}-${randomUUID().slice(0, 8)}`,
      starts_at: new Date(otherStart).toISOString(),
      ends_at: new Date(otherStart + 3_600_000).toISOString(),
      status: "confirmed",
      source: "admin",
    });
    await page.reload();

    const card = page.locator(".admin-booking").filter({ hasText: "Jordan Tester" });
    await card.getByRole("button", { name: "Edit the booking for Jordan Tester" }).click();
    // In edit mode the name is only an input value, so find the (only) edit form on the page.
    const form = page.getByRole("form", { name: "Edit Jordan's booking" });

    // Exactly the other booking's start: blocked.
    const clash = gymDateTime(new Date(otherStart).toISOString());
    await form.getByLabel("Date").fill(clash.date);
    await form.getByLabel("Start time").selectOption(clash.time);
    await expect(form).toContainText(
      "Moving this request also confirms it. Saving sends Jordan the confirmation email with the new time.",
    );
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(form.getByRole("alert")).toHaveText("Another booking already holds that time. Please choose another.");
    await expect(form.getByRole("button", { name: "Save anyway" })).toHaveCount(0);

    // A quarter hour earlier overlaps it: warned, and can be saved anyway.
    const overlap = gymDateTime(new Date(otherStart - 15 * 60_000).toISOString());
    await form.getByLabel("Start time").selectOption(overlap.time);
    await form.getByRole("button", { name: "Save changes" }).click();
    const warning = form.getByRole("alert");
    await expect(warning).toContainText(/^This overlaps Sam's \d{1,2}:\d{2} [AP]M session\./);
    await expectNoSeriousViolations(page, "/admin (edit form, moved, overlap warning)");

    // "Don't email the client" is a 48px target with a focus ring.
    const dontEmail = form.getByLabel("Don't email the client");
    await expect(dontEmail).not.toBeChecked();
    await dontEmail.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(dontEmail).toBeFocused();
    const row = await form.locator(".check-field").boundingBox();
    expect(row?.height ?? 0, "Don't email row height").toBeGreaterThanOrEqual(48);
    const ring = await dontEmail.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
    });
    expect(ring, "Don't email focus ring").toBe(true);

    await form.getByRole("button", { name: "Save anyway" }).click();
    const result = card.locator(".notice-message, .warning-message");
    await expect(result).toHaveText(
      /^Moved and confirmed Jordan's session for .+ at \d{1,2}:\d{2} [AP]M(\. Jordan has been emailed a confirmation\.|, but the email to Jordan didn't send\. Please call or email them yourself\.)$/,
    );
    await expect(result).toBeFocused();
    await expect(card.locator(".status-badge")).toHaveText("Confirmed");
    await expect(card.locator(".source-tag").filter({ hasText: "Edited" })).toBeVisible();
    await expectNoSeriousViolations(page, "/admin (after moving)");

    // Moving a confirmed booking, with Don't email the client ticked.
    await card.getByRole("button", { name: "Edit the booking for Jordan Tester" }).click();
    const later = gymDateTime(new Date(otherStart + 2 * 3_600_000).toISOString());
    await form.getByLabel("Date").fill(later.date);
    await form.getByLabel("Start time").selectOption(later.time);
    await expect(form).toContainText("Saving emails Jordan the old and new times.");
    await form.getByLabel("Don't email the client").check();
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByRole("status")).toHaveText(
      /^Moved Jordan's session to .+ at \d{1,2}:\d{2} [AP]M\. Jordan has not been emailed\.$/,
    );
  });

  test("cancelled and past bookings offer no Edit", async ({ page, request }) => {
    await signInAsAdminWithBooking(page, request);
    await request.patch(`${supabaseUrl}/rest/v1/booking_requests?id=eq.${seeded.bookingId}`, {
      headers: adminHeaders,
      data: { status: "cancelled" },
    });
    const pastStart = Date.now() - 2 * 86_400_000 - Math.floor(Math.random() * 1_000_000) * 1000;
    const pastName = `Pat ${ADDED_MARK}-${randomUUID().slice(0, 8)}`;
    await rest(request, "booking_requests", {
      name: pastName,
      starts_at: new Date(pastStart).toISOString(),
      ends_at: new Date(pastStart + 3_600_000).toISOString(),
      status: "confirmed",
      source: "admin",
    });
    await page.reload();

    const cancelled = page.locator(".admin-booking").filter({ hasText: "Jordan Tester" });
    await expect(cancelled.locator(".status-badge")).toHaveText("Cancelled");
    await expect(cancelled.getByRole("button", { name: /^Edit/ })).toHaveCount(0);

    await page.getByText(/^Past bookings/).click();
    const past = page.locator(".admin-booking").filter({ hasText: pastName });
    await expect(past).toBeVisible();
    await expect(past.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
  });
});
