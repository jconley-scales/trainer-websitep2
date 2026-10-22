import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * "Your upcoming sessions" home screen and cancel flow.
 *
 * Setup goes through the privileged service-role API (like the DB tests); the
 * client signs in through the real email-code login so the app runs with a real
 * session and RLS applies. Expected dates assume the portal's configured display
 * time zone (America/New_York, see lib/format.ts); slots are far in the future so
 * the tests never go stale.
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

// 2030-03-05 is a Tuesday and 2030-03-07 a Thursday; both are before US daylight
// saving starts (March 10), so New York is UTC-5.
const SLOT_A = {
  startsAt: "2030-03-05T15:00:00Z", // Tuesday 10:00 AM
  endsAt: "2030-03-05T16:00:00Z",
  location: "Main Gym",
};
const SLOT_B = {
  startsAt: "2030-03-07T22:30:00Z", // Thursday 5:30 PM
  endsAt: "2030-03-07T23:30:00Z",
  location: "Park Studio",
};

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
    data: { email: `trainer-${randomUUID()}@example.com`, email_confirm: true },
  });
  expect(res.ok()).toBeTruthy();
  const trainerId = ((await res.json()) as { id: string }).id;
  created.users.push(trainerId);

  await rest(request, "profiles", { id: trainerId, full_name: "Taylor Trainer", role: "trainer" });
  const slots: { id: string }[] = [];
  for (const s of [SLOT_A, SLOT_B]) {
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

/** Sign in through the real login screen. `beforeSubmit` runs once the user id is known. */
async function signIn(
  page: Page,
  request: APIRequestContext,
  beforeSubmit?: (clientId: string) => Promise<void>,
) {
  const address = `e2e-sessions-${randomUUID()}@example.com`;
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

  // The profile must exist before any booking can reference it.
  await rest(request, "profiles", { id: body.id, role: "client" });
  if (beforeSubmit) await beforeSubmit(body.id as string);

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

async function signInWithTwoBookings(page: Page, request: APIRequestContext) {
  const slots = await createTrainerWithSlots(request);
  await signIn(page, request, async (clientId) => {
    for (const slot of slots) {
      await rest(request, "bookings", { slot_id: slot.id, client_id: clientId });
    }
  });
}

test("shows the heading, a Book button and a card per upcoming session", async ({ page, request }) => {
  await signInWithTwoBookings(page, request);

  await expect(page.getByRole("heading", { level: 1, name: "Your upcoming sessions" })).toBeVisible();

  const book = page.getByRole("link", { name: "Book a session" });
  await expect(book).toBeVisible();
  await expect(book).toHaveAttribute("href", "/book");
  expect((await book.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  const cards = page.getByRole("listitem");
  await expect(cards).toHaveCount(2);

  // Soonest first: day, date, time, trainer name and location are all readable.
  await expect(cards.nth(0)).toContainText("Tuesday, March 5, 2030");
  await expect(cards.nth(0)).toContainText("10:00 AM to 11:00 AM");
  await expect(cards.nth(0)).toContainText("Taylor Trainer");
  await expect(cards.nth(0)).toContainText("Main Gym");
  await expect(cards.nth(1)).toContainText("Thursday, March 7, 2030");
  await expect(cards.nth(1)).toContainText("5:30 PM to 6:30 PM");
  await expect(cards.nth(1)).toContainText("Taylor Trainer");
  await expect(cards.nth(1)).toContainText("Park Studio");

  // Big, labelled Cancel buttons.
  const cancel = cards.nth(0).getByRole("button", { name: /^Cancel this session/ });
  expect((await cancel.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  const fontSize = await cancel.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(18);
});

test("Cancel asks for confirmation naming the date and time, and confirming removes the card", async ({ page, request }) => {
  await signInWithTwoBookings(page, request);

  const cards = page.getByRole("listitem");
  await cards.nth(0).getByRole("button", { name: /^Cancel this session/ }).click();

  const dialog = page.getByRole("dialog", { name: "Cancel this session?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Tuesday, March 5, 2030");
  await expect(dialog).toContainText("10:00 AM");
  const no = dialog.getByRole("button", { name: "No, keep my session" });
  const yes = dialog.getByRole("button", { name: "Yes, cancel session" });
  expect((await no.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect((await yes.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  await yes.click();

  await expect(dialog).toBeHidden();
  await expect(cards).toHaveCount(1);
  await expect(page.getByText("Tuesday, March 5, 2030")).toHaveCount(0);
  await expect(cards.first()).toContainText("Thursday, March 7, 2030");

  // The cancellation is real: it survives a reload.
  await page.reload();
  await expect(cards).toHaveCount(1);
});

test("the confirm dialog is keyboard friendly: focus stays inside, Escape keeps the session", async ({ page, request }) => {
  await signInWithTwoBookings(page, request);

  const cards = page.getByRole("listitem");
  const trigger = cards.nth(0).getByRole("button", { name: /^Cancel this session/ });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Cancel this session?" });
  await expect(dialog).toBeVisible();
  // The safe choice has focus first.
  await expect(dialog.getByRole("button", { name: "No, keep my session" })).toBeFocused();

  // Tab never leaves the dialog.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(cards).toHaveCount(2);
  await expect(trigger).toBeFocused();
});

test("shows a friendly empty state with the Book button when there are no sessions", async ({ page, request }) => {
  await signIn(page, request);

  await expect(page.getByRole("heading", { level: 1, name: "Your upcoming sessions" })).toBeVisible();
  await expect(page.getByText("You have no upcoming sessions")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a session" })).toBeVisible();
});
