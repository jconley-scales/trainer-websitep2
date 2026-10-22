import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("unauthenticated visit to /sessions redirects to /login", async ({ page }) => {
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("paths ending in image-like letters (no dot) are still protected", async ({ page }) => {
  for (const path of ["/medico", "/exportpng", "/ico", "/sessions/jpg"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("login page shows a large labeled email field, then the code step", async ({ page }) => {
  await page.goto("/login");

  const email = page.getByLabel("Your email address");
  await expect(email).toBeVisible();
  const emailBox = await email.boundingBox();
  expect(emailBox!.height).toBeGreaterThanOrEqual(48);
  const fontSize = await email.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(18);

  await email.fill("e2e-ui@example.com");
  const send = page.getByRole("button", { name: "Email me a code" });
  expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await send.click();

  const code = page.getByLabel("Code from your email");
  await expect(code).toBeVisible();
  expect((await code.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(page.getByText("e2e-ui@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend code" })).toBeVisible();
});

test("a wrong code shows a plain-language error and stays on the code step", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Your email address").fill("e2e-wrong@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();

  await page.getByLabel("Code from your email").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator("#login-error")).toContainText(/code/i);
  await expect(page.locator("#login-error")).toHaveAttribute("role", "alert");
  await expect(page).toHaveURL(/\/login$/);
});

function envVar(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env.local`);
  return line.slice(name.length + 1).trim();
}

test("full login: a valid code signs the user in and creates a client profile", async ({ page, request }) => {
  const supabaseUrl = envVar("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envVar("SUPABASE_SERVICE_ROLE_KEY");
  const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const address = `e2e-${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Your email address").fill(address);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Code from your email")).toBeVisible();

  // Get a real, valid email OTP for this user from the Auth admin API. (We do not
  // scrape Mailpit: the code only appears in the email once the local stack has
  // been restarted with supabase/templates/*.html, so this keeps the test stable.)
  const link = await request.post(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    headers: adminHeaders,
    data: { type: "magiclink", email: address },
  });
  expect(link.ok()).toBeTruthy();
  const linkBody = await link.json();
  const code = linkBody.email_otp as string;
  const userId = linkBody.id as string;
  expect(code).toMatch(/^\d{6}$/);

  await page.getByLabel("Code from your email").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();

  // /sessions is built in a later task, so only the navigation matters here.
  await expect(page).toHaveURL(/\/sessions$/);

  // Signed-in users are sent away from /login.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/sessions$/);

  // First login created a profile with role "client".
  const profile = await request.get(`${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${userId}`, {
    headers: adminHeaders,
  });
  expect(await profile.json()).toEqual([{ role: "client" }]);
});
