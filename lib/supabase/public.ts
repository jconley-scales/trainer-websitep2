import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Anon Supabase client for public, server-side writes (the booking form).
 *
 * It uses the public anon key and carries no session, so it acts as the `anon`
 * role: row level security lets it INSERT a booking_request and nothing else.
 * Never use this to read booking_requests — reads are blocked for anon on
 * purpose, so clients' contact details are never served back through the site.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
