/**
 * Give someone access to the bookings admin page (/admin).
 *
 *   npm run admin:add -- you@example.com
 *
 * Creates their sign-in account (if it does not exist yet) and adds the email
 * to the `admins` list. Public sign-up is switched off, so this is the only way
 * an account gets created. Uses the SERVICE ROLE key, which bypasses row level
 * security: keep it out of the browser and out of git.
 *
 * Reads from the environment or `.env.local`:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (local: `npx supabase status`)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function envVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() || undefined : undefined;
  } catch {
    return undefined;
  }
}

function required(name: string): string {
  const value = envVar(name);
  if (!value) {
    console.error(`${name} is not set (put it in the environment or .env.local).`);
    process.exit(1);
  }
  return value;
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run admin:add -- you@example.com");
  process.exit(1);
}

const db = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: userError } = await db.auth.admin.createUser({ email, email_confirm: true });
if (userError && !/already|exists|registered/i.test(userError.message)) {
  console.error(`Could not create the account: ${userError.message}`);
  process.exit(1);
}

const { error: adminError } = await db.from("admins").upsert({ email }, { onConflict: "email" });
if (adminError) {
  console.error(`Could not add to admins: ${adminError.message}`);
  process.exit(1);
}

console.log(`${email} can now sign in at /admin/sign-in.`);
