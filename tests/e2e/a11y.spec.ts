import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * End-to-end accessibility pass over every screen, for a 60+ audience.
 *
 * For each screen (and each dialog / error state reachable from it) this runs
 * axe-core and requires zero serious or critical violations, then walks the page
 * with the Tab key and requires that every interactive control is reachable, has
 * a visible focus indicator and is at least 48x48 CSS px.
 *
 * Setup follows the other e2e specs: the privileged service-role API seeds a
 * trainer, slots and a booking, and the client signs in through the real email
 * code login, so /sessions and /book render real, authenticated content (never
 * an empty page or a redirect to /login). Slots are in 2032 so they never go
 * stale or collide with the other specs' data.
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

// 2032-03-02 is a Tuesday and 2032-03-03 a Wednesday.
const SLOTS = [
  { startsAt: "2032-03-02T15:00:00Z", endsAt: "2032-03-02T16:00:00Z", location: "Main Gym" },
  { startsAt: "2032-03-02T19:30:00Z", endsAt: "2032-03-02T20:30:00Z", location: "Park Studio" },
  { startsAt: "2032-03-03T22:30:00Z", endsAt: "2032-03-03T23:30:00Z", location: "Main Gym" },
];

const created = { users: [] as string[], slots: [] as string[] };

async function rest(request: APIRequestContext, table: string, row: object) {
  const res = await request.post(`${supabaseUrl}/rest/v1/${table}`, {
    headers: adminHeaders,
    data: row,
  });
  expect(res.ok(), `insert into ${table}: ${await res.text()}`).toBeTruthy();
  return (await res.json())[0] as { id: string };
}

async function createTrainerWithSlots(request: APIRequestContext) {
  const res = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: adminHeaders,
    data: { email: `a11y-trainer-${randomUUID()}@example.com`, email_confirm: true },
  });
  expect(res.ok()).toBeTruthy();
  const trainerId = ((await res.json()) as { id: string }).id;
  created.users.push(trainerId);

  await rest(request, "profiles", { id: trainerId, full_name: "Taylor Trainer", role: "trainer" });
  const slots: { id: string }[] = [];
  for (const s of SLOTS) {
    const slot = await rest(request, "slots", {
      starts_at: s.startsAt,
      ends_at: s.endsAt,
      trainer_id: trainerId,
      location: s.location,
    });
    created.slots.push(slot.id);
    slots.push(slot);
  }
  return slots;
}

/**
 * Seeds a trainer with three slots, signs in a new client through the real login
 * screen, and books the first slot for them. Afterwards /sessions shows one
 * booked session and /book offers the other two slots.
 */
async function signInWithContent(page: Page, request: APIRequestContext) {
  const slots = await createTrainerWithSlots(request);
  const address = `e2e-a11y-${randomUUID()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Your email address").fill(address);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Code from your email")).toBeVisible();

  const link = await request.post(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    headers: adminHeaders,
    data: { type: "magiclink", email: address },
  });
  expect(link.ok()).toBeTruthy();
  const body = await link.json();
  created.users.push(body.id as string);

  await rest(request, "profiles", { id: body.id, role: "client" });
  await rest(request, "bookings", { slot_id: slots[0].id, client_id: body.id });

  await page.getByLabel("Code from your email").fill(body.email_otp as string);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
}

test.afterEach(async ({ request }) => {
  const inList = (ids: string[]) => `in.(${ids.join(",")})`;
  if (created.slots.length) {
    // Bookings reference slots and profiles, so they go first.
    await request.delete(`${supabaseUrl}/rest/v1/bookings?slot_id=${inList(created.slots)}`, {
      headers: adminHeaders,
    });
    await request.delete(`${supabaseUrl}/rest/v1/slots?id=${inList(created.slots)}`, {
      headers: adminHeaders,
    });
  }
  for (const id of created.users) {
    await request.delete(`${supabaseUrl}/auth/v1/admin/users/${id}`, { headers: adminHeaders });
  }
  created.users.length = 0;
  created.slots.length = 0;
});

/** Fails with a readable list if axe finds any serious or critical violation. */
async function expectNoSeriousViolations(page: Page, state: string) {
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
async function tabThrough(page: Page, maxStops = 30): Promise<FocusStop[]> {
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
      const rect = el.getBoundingClientRect();
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
    return Array.from(
      container.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
    ).filter((el) => {
      if ((el as HTMLButtonElement).disabled) return false;
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
    for (const id of ["services", "about", "testimonials", "contact"]) {
      await expect(page.locator(`section[aria-labelledby="${id}-title"] h2`)).toHaveCount(1);
    }
    const main = page.locator("main#main-content");
    for (const [name, href] of [
      ["See all services", "/services"],
      ["Read more about Sarah", "/about"],
      ["More kind words from clients", "/testimonials"],
      ["Get in touch with Sarah", "/contact"],
    ]) {
      await expect(main.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    // The home page is a landing page: previews only, two quotes not three.
    await expect(main.locator(".testimonial-card")).toHaveCount(2);
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

  test("the nav links to the real pages and the Client login button goes to /login", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const [name, href] of PUBLIC_NAV) {
      await expect(nav.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("banner").getByRole("link", { name: "Client login" }).click();
    await expect(page).toHaveURL(/\/login$/);
    // The sign-in page has a way back to the public site.
    await page.getByRole("banner").getByRole("link", { name: "Peak Form Training" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

const PUBLIC_NAV = [
  ["Home", "/"],
  ["About", "/about"],
  ["Services", "/services"],
  ["Testimonials", "/testimonials"],
  ["Contact", "/contact"],
] as const;

const PUBLIC_PAGES = [
  { path: "/about", nav: "About", h1: /^About /, title: /^About .+ \| Peak Form Training$/ },
  { path: "/services", nav: "Services", h1: "Services and pricing", title: /^Services and pricing \| / },
  { path: "/testimonials", nav: "Testimonials", h1: "Kind words from clients", title: /^Testimonials \| / },
  { path: "/contact", nav: "Contact", h1: "Get in touch", title: /^Contact \| / },
] as const;

/** The contact form's submit button is disabled until the page has hydrated. */
async function waitForInteractive(page: Page) {
  for (const button of await page.getByRole("button", { name: "Open my email app" }).all()) {
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

test.describe("public page content and links", () => {
  test("services lists every service and a free-consult call to action to /contact", async ({ page }) => {
    await page.goto("/services");
    await expect(page.locator(".feature-card")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Book a free consult" }).first()).toHaveAttribute("href", "/contact");
  });

  test("testimonials shows all the quotes", async ({ page }) => {
    await page.goto("/testimonials");
    await expect(page.locator(".testimonial-card")).toHaveCount(3);
  });

  test("contact has real mailto and tel links and a form that composes a mailto (no backend)", async ({ page }) => {
    await page.goto("/contact");
    const main = page.locator("main#main-content");
    await expect(main.getByRole("link", { name: /^Email / })).toHaveAttribute("href", /^mailto:[^?]+\?subject=/);
    await expect(main.getByRole("link", { name: /^Call / })).toHaveAttribute("href", /^tel:\+?\d+$/);
    await expect(main.getByLabel("Your name")).toBeVisible();
    await expect(main.getByLabel("Your message")).toBeVisible();
    // Submitting only hands a mailto: link to the email app: no request to any server,
    // nothing personal in any URL, and the visitor stays on the page.
    const requests: { method: string; url: string }[] = [];
    page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
    const submit = main.getByRole("button", { name: "Open my email app" });
    await expect(submit).toBeEnabled();
    await main.getByLabel("Your name").fill("Pat Example");
    await main.getByLabel("Your phone number (optional)").fill("555 0100");
    await main.getByLabel("Your message").fill("I would like a free consultation.");
    await submit.click();
    await expect(page).toHaveURL(/\/contact$/);
    expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
    expect(requests.filter((r) => r.url.includes("/contact?"))).toEqual([]);
  });

  test("without JavaScript the form cannot be submitted, so nothing personal reaches the URL", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto("/contact");
    const main = page.locator("main#main-content");
    await expect(main.getByRole("button", { name: "Open my email app" })).toBeDisabled();
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

test.describe("/login", () => {
  test("email step: no serious axe violations, keyboard reachable, 48px targets, visible focus", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Your email address")).toBeVisible();
    await expectNoSeriousViolations(page, "/login (email step)");
    await expectKeyboardAndTargets(page, "/login (email step)");
  });

  test("code step and a wrong-code error: no serious axe violations", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Your email address").fill("a11y-login@example.com");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByLabel("Code from your email")).toBeVisible();
    await expectNoSeriousViolations(page, "/login (code step)");
    await expectKeyboardAndTargets(page, "/login (code step)");

    await page.getByLabel("Code from your email").fill("000000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#login-error")).toBeVisible();
    await expectNoSeriousViolations(page, "/login (wrong code error)");
  });
});

test.describe("/sessions", () => {
  test("with a booked session: no serious axe violations, keyboard, targets, focus", async ({ page, request }) => {
    await signInWithContent(page, request);
    // Real content, not an empty state or a redirect.
    await expect(page).toHaveURL(/\/sessions$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your upcoming sessions" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("listitem").first()).toContainText("Taylor Trainer");

    await expectNoSeriousViolations(page, "/sessions");
    await expectKeyboardAndTargets(page, "/sessions");
  });

  test("with the cancel dialog open: no serious axe violations, keyboard, targets, focus", async ({ page, request }) => {
    await signInWithContent(page, request);
    await page.getByRole("button", { name: /^Cancel this session/ }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel this session?" });
    await expect(dialog).toBeVisible();

    await expectNoSeriousViolations(page, "/sessions (cancel dialog)");
    // Focus is trapped in the dialog: it holds exactly its own two buttons.
    await expectKeyboardAndTargets(page, "/sessions (cancel dialog)");
  });

  test("after cancelling (status message, empty state): no serious axe violations", async ({ page, request }) => {
    await signInWithContent(page, request);
    await page.getByRole("button", { name: /^Cancel this session/ }).click();
    await page.getByRole("button", { name: "Yes, cancel session" }).click();
    await expect(page.getByRole("status")).toContainText("has been cancelled");
    await expect(page.getByText("You have no upcoming sessions")).toBeVisible();

    await expectNoSeriousViolations(page, "/sessions (after cancel)");
    await expectKeyboardAndTargets(page, "/sessions (after cancel)");
  });
});

test.describe("/book", () => {
  test("with open slots: no serious axe violations, keyboard, targets, focus", async ({ page, request }) => {
    await signInWithContent(page, request);
    await page.goto("/book");
    await expect(page.getByRole("heading", { level: 1, name: "Book a session" })).toBeVisible();
    // The seeded booking took one slot; the other two are on offer.
    await expect(page.getByRole("button", { name: /Main Gym|Park Studio/ })).toHaveCount(2);

    await expectNoSeriousViolations(page, "/book");
    await expectKeyboardAndTargets(page, "/book");
  });

  test("with the booking dialog open: no serious axe violations, keyboard, targets, focus", async ({ page, request }) => {
    await signInWithContent(page, request);
    await page.goto("/book");
    await page.getByRole("button", { name: /Park Studio/ }).click();
    const dialog = page.getByRole("dialog", { name: /^Book your session on/ });
    await expect(dialog).toBeVisible();

    await expectNoSeriousViolations(page, "/book (booking dialog)");
    await expectKeyboardAndTargets(page, "/book (booking dialog)");
  });

  test("after a slot is taken in the meantime (error message): no serious axe violations", async ({ page, request }) => {
    const slots = await createTrainerWithSlots(request);
    const address = `e2e-a11y-${randomUUID()}@example.com`;
    await page.goto("/login");
    await page.getByLabel("Your email address").fill(address);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByLabel("Code from your email")).toBeVisible();
    const link = await request.post(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      headers: adminHeaders,
      data: { type: "magiclink", email: address },
    });
    const body = await link.json();
    created.users.push(body.id as string);
    await rest(request, "profiles", { id: body.id, role: "client" });
    await page.getByLabel("Code from your email").fill(body.email_otp as string);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sessions$/);

    await page.goto("/book");
    await page.getByRole("button", { name: /Main Gym/ }).first().click();
    const dialog = page.getByRole("dialog", { name: /^Book your session on/ });
    await expect(dialog).toBeVisible();

    // Another client takes the first slot while the dialog is open.
    const other = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: adminHeaders,
      data: { email: `a11y-other-${randomUUID()}@example.com`, email_confirm: true },
    });
    const otherId = ((await other.json()) as { id: string }).id;
    created.users.push(otherId);
    await rest(request, "profiles", { id: otherId, role: "client" });
    await rest(request, "bookings", { slot_id: slots[0].id, client_id: otherId });

    await dialog.getByRole("button", { name: "Yes, book this session" }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toHaveText("Sorry, that time was just taken. Please choose another.");

    await expectNoSeriousViolations(page, "/book (slot taken message)");
  });
});

test.describe("colour contrast of controls axe cannot fully judge", () => {
  test("cancel dialog: white-on-red danger button and the dialog text meet AA (4.5:1)", async ({ page, request }) => {
    await signInWithContent(page, request);
    await page.getByRole("button", { name: /^Cancel this session/ }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel this session?" });
    await expect(dialog).toBeVisible();

    expect(await contrastRatio(dialog.getByRole("button", { name: "Yes, cancel session" }))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(dialog.getByRole("button", { name: "No, keep my session" }))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(dialog.locator("strong"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(dialog.getByRole("heading", { level: 2 }))).toBeGreaterThanOrEqual(4.5);
  });

  test("booking dialog and slot rows meet AA (4.5:1)", async ({ page, request }) => {
    await signInWithContent(page, request);
    await page.goto("/book");
    const row = page.getByRole("button", { name: /Park Studio/ });
    expect(await contrastRatio(row.locator(".slot-time"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(row.locator(".slot-detail"))).toBeGreaterThanOrEqual(4.5);
    await row.click();
    const dialog = page.getByRole("dialog", { name: /^Book your session on/ });
    await expect(dialog).toBeVisible();
    expect(await contrastRatio(dialog.getByRole("button", { name: "Yes, book this session" }))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(dialog.locator("strong"))).toBeGreaterThanOrEqual(4.5);
  });

  test("buttons stay readable on hover: cancel, dialog and booking buttons keep AA contrast", async ({ page, request }) => {
    await signInWithContent(page, request);
    const cancel = page.getByRole("button", { name: /^Cancel this session/ });
    await cancel.hover();
    expect(await contrastRatio(cancel)).toBeGreaterThanOrEqual(4.5);
    await cancel.click();
    const dialog = page.getByRole("dialog", { name: "Cancel this session?" });
    for (const name of ["No, keep my session", "Yes, cancel session"]) {
      const button = dialog.getByRole("button", { name });
      await button.hover();
      expect(await contrastRatio(button), name).toBeGreaterThanOrEqual(4.5);
    }
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "Book a session" }).hover();
    expect(await contrastRatio(page.getByRole("link", { name: "Book a session" }))).toBeGreaterThanOrEqual(4.5);
    await page.goto("/book");
    const row = page.getByRole("button", { name: /Park Studio/ });
    await row.hover();
    expect(await contrastRatio(row.locator(".slot-time"))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastRatio(row.locator(".slot-detail"))).toBeGreaterThanOrEqual(4.5);
    await row.click();
    const booking = page.getByRole("dialog", { name: /^Book your session on/ });
    for (const name of ["No, go back", "Yes, book this session"]) {
      const button = booking.getByRole("button", { name });
      await button.hover();
      expect(await contrastRatio(button), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("error messages meet AA (4.5:1)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Your email address").fill("a11y-contrast@example.com");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await page.getByLabel("Code from your email").fill("000000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#login-error")).toBeVisible();
    expect(await contrastRatio(page.locator("#login-error"))).toBeGreaterThanOrEqual(4.5);
  });
});
