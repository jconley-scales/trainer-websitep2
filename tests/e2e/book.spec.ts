import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * "Book a session" screen and booking flow.
 *
 * Setup goes through the privileged service-role API (like the other e2e/DB
 * tests); the client signs in through the real email-code login so the app runs
 * with a real session and RLS applies. Slots are far in the future (2031) so the
 * tests never go stale and never collide with the sessions spec's 2030 data.
 * Expected dates assume the portal's display time zone (America/New_York): both
 * dates are before US daylight saving starts (March 9, 2031), so New York is UTC-5.
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

// 2031-03-05 is a Wednesday and 2031-03-06 a Thursday.
const SLOTS = [
  { startsAt: "2031-03-05T15:00:00Z", endsAt: "2031-03-05T16:00:00Z", location: "Main Gym" }, // Wed 10:00 AM
  { startsAt: "2031-03-05T19:30:00Z", endsAt: "2031-03-05T20:30:00Z", location: "Park Studio" }, // Wed 2:30 PM
  { startsAt: "2031-03-06T22:30:00Z", endsAt: "2031-03-06T23:30:00Z", location: "Main Gym" }, // Thu 5:30 PM
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

async function createUser(request: APIRequestContext, profile: object) {
  const res = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: adminHeaders,
    data: { email: `book-${randomUUID()}@example.com`, email_confirm: true },
  });
  expect(res.ok()).toBeTruthy();
  const id = ((await res.json()) as { id: string }).id;
  created.users.push(id);
  await rest(request, "profiles", { id, ...profile });
  return id;
}

async function createSlots(request: APIRequestContext) {
  const trainerId = await createUser(request, { full_name: "Taylor Trainer", role: "trainer" });
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

/** Sign in as a brand new client through the real login screen. */
async function signIn(page: Page, request: APIRequestContext) {
  const address = `e2e-book-${randomUUID()}@example.com`;
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

const WED = "Wednesday, March 5, 2031";
const THU = "Thursday, March 6, 2031";

test("lists open slots grouped by day as large tappable rows, with a way back", async ({ page, request }) => {
  await createSlots(request);
  await signIn(page, request);
  await page.goto("/book");

  await expect(page.getByRole("heading", { level: 1, name: "Book a session" })).toBeVisible();

  // One heading per day, rows underneath it.
  const wed = page.getByRole("region", { name: WED });
  const thu = page.getByRole("region", { name: THU });
  await expect(wed.getByRole("heading", { level: 2, name: WED })).toBeVisible();
  await expect(thu.getByRole("heading", { level: 2, name: THU })).toBeVisible();
  await expect(wed.getByRole("button")).toHaveCount(2);
  await expect(thu.getByRole("button")).toHaveCount(1);

  // Soonest first, each row showing time, location and trainer.
  const first = wed.getByRole("button").nth(0);
  await expect(first).toContainText("10:00 AM to 11:00 AM");
  await expect(first).toContainText("Main Gym");
  await expect(first).toContainText("Taylor Trainer");
  const second = wed.getByRole("button").nth(1);
  await expect(second).toContainText("2:30 PM to 3:30 PM");
  await expect(second).toContainText("Park Studio");
  await expect(thu.getByRole("button")).toContainText("5:30 PM to 6:30 PM");

  // Real >= 48px tap targets with large type.
  for (const row of [first, second, thu.getByRole("button")]) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    const fontSize = await row.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(18);
  }

  const back = page.getByRole("link", { name: "Back to your sessions" });
  await expect(back).toHaveAttribute("href", "/sessions");
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test("tapping a slot asks to confirm, naming the day and time; No keeps things as they were", async ({ page, request }) => {
  await createSlots(request);
  await signIn(page, request);
  await page.goto("/book");

  const row = page.getByRole("region", { name: WED }).getByRole("button").first();
  await row.click();

  const dialog = page.getByRole("dialog", { name: `Book your session on ${WED} at 10:00 AM?` });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Main Gym");
  await expect(dialog).toContainText("Taylor Trainer");
  const no = dialog.getByRole("button", { name: "No, go back" });
  const yes = dialog.getByRole("button", { name: "Yes, book this session" });
  expect((await no.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect((await yes.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(no).toBeFocused();

  await no.click();
  await expect(dialog).toBeHidden();
  await expect(row).toBeFocused();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole("region", { name: WED }).getByRole("button")).toHaveCount(2);
});

test("confirming books the slot and returns to /sessions with the session and a visible, announced message", async ({ page, request }) => {
  await createSlots(request);
  await signIn(page, request);
  await page.goto("/book");

  await page.getByRole("region", { name: WED }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Yes, book this session" }).click();

  await expect(page).toHaveURL(/\/sessions/);
  await expect(page.getByRole("heading", { level: 1, name: "Your upcoming sessions" })).toBeVisible();

  // The new session is listed...
  const cards = page.getByRole("listitem");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(WED);
  await expect(cards.first()).toContainText("10:00 AM to 11:00 AM");
  await expect(cards.first()).toContainText("Main Gym");

  // ...and the success message is on screen, inside the one live region.
  const status = page.getByRole("status");
  await expect(status).toHaveText(`Your session on ${WED} at 10:00 AM has been booked.`);
  await expect(status).toBeVisible();
  // Focus lands on the heading so keyboard and screen reader users are oriented.
  await expect(page.getByRole("heading", { level: 1, name: "Your upcoming sessions" })).toBeFocused();

  // The booking is real, and the slot is no longer offered.
  await page.goto("/book");
  await expect(page.getByRole("region", { name: WED }).getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("region", { name: WED })).toContainText("2:30 PM to 3:30 PM");
});

test("a booked-then-cancelled session is announced as cancelled, replacing the booked message", async ({ page, request }) => {
  await createSlots(request);
  await signIn(page, request);
  await page.goto("/book");
  await page.getByRole("region", { name: THU }).getByRole("button").click();
  await page.getByRole("button", { name: "Yes, book this session" }).click();
  await expect(page.getByRole("status")).toContainText("has been booked.");

  await page.getByRole("button", { name: /^Cancel this session/ }).click();
  await page.getByRole("button", { name: "Yes, cancel session" }).click();
  await expect(page.getByRole("status")).toHaveText(`Your session on ${THU} at 5:30 PM has been cancelled.`);
});

test("a slot taken by someone else in the meantime shows a friendly message and is no longer offered", async ({ page, request }) => {
  const slots = await createSlots(request);
  await signIn(page, request);
  await page.goto("/book");

  const wed = page.getByRole("region", { name: WED });
  await wed.getByRole("button").first().click();
  const dialog = page.getByRole("dialog", { name: `Book your session on ${WED} at 10:00 AM?` });
  await expect(dialog).toBeVisible();

  // Meanwhile another client grabs that very slot.
  const other = await createUser(request, { role: "client" });
  await rest(request, "bookings", { slot_id: slots[0].id, client_id: other });

  await dialog.getByRole("button", { name: "Yes, book this session" }).click();

  const alert = page.locator("main").getByRole("alert"); // not Next's route announcer
  await expect(alert).toHaveText("Sorry, that time was just taken. Please choose another.");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/book/);

  // The taken time is gone from the list; the others remain.
  await expect(wed.getByRole("button")).toHaveCount(1);
  await expect(wed).toContainText("2:30 PM to 3:30 PM");

  // Nothing was booked for this client.
  await page.getByRole("link", { name: "Back to your sessions" }).click();
  await expect(page).toHaveURL(/\/sessions/);
  await expect(page.getByText("You have no upcoming sessions")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("");
});

test("the confirm dialog is keyboard friendly: Escape closes it and focus returns to the slot", async ({ page, request }) => {
  await createSlots(request);
  await signIn(page, request);
  await page.goto("/book");

  const row = page.getByRole("region", { name: THU }).getByRole("button");
  await row.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: `Book your session on ${THU} at 5:30 PM?` });
  await expect(dialog).toBeVisible();

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(row).toBeFocused();
});

test("a failed booking request keeps the screen, shows an error in the dialog and claims no success", async ({ page, request }) => {
  await createSlots(request);
  await signIn(page, request);
  await page.goto("/book");

  // Make the Server Action request fail at the network level.
  await page.route("**/book", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );

  await page.getByRole("region", { name: THU }).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: `Book your session on ${THU} at 5:30 PM?` });
  await dialog.getByRole("button", { name: "Yes, book this session" }).click();

  await expect(dialog.getByRole("alert")).toContainText("could not book");
  await expect(dialog.getByRole("button", { name: "No, go back" })).toBeFocused();
  await expect(page).toHaveURL(/\/book$/);
});
