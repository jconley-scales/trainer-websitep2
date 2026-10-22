import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER ONLY — it bypasses row level security.
 *
 * Needed because `authenticated` users deliberately have no INSERT grant on
 * `profiles` (so nobody can pick their own role). Only import this from
 * server code (Server Actions / Route Handlers), never from a Client Component.
 * The key comes from a non-`NEXT_PUBLIC_` env var, so it is never sent to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
