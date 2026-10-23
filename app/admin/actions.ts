"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Supabase email codes are numeric; local config uses 6 digits, hosted may use up to 10.
const CODE_PATTERN = /^\d{6,10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["new", "confirmed", "cancelled"] as const;
type Status = (typeof STATUSES)[number];
const UNIQUE_VIOLATION = "23505";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Email a one-time sign-in code. Only existing accounts get one (sign-up is
 * off, and shouldCreateUser is false), and the reply is the same either way, so
 * this cannot be used to find out which addresses are admins.
 */
export async function sendAdminCode(email: string): Promise<ActionResult> {
  const address = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(address)) {
    return { ok: false, error: "Please enter a valid email address, like name@example.com." };
  }
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
  return { ok: true };
}

/** Check the emailed code; on success the session cookies are set. */
export async function verifyAdminCode(email: string, code: string): Promise<ActionResult> {
  const address = normalizeEmail(email);
  const token = code.replace(/\s+/g, "");
  const badCode = {
    ok: false,
    error:
      'That code did not work. It may be wrong or out of date. Check your newest email, or choose "Resend code".',
  } as const;
  if (!CODE_PATTERN.test(token)) return badCode;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: address, token, type: "email" });
  if (error || !data?.session) return badCode;
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/sign-in");
}

/**
 * Confirm, cancel or re-open a booking request. Reachable by direct POST, so it
 * re-checks the session; the update itself runs as the signed-in user, so row
 * level security only lets an admin change a row (anyone else matches nothing).
 */
export async function setBookingStatus(id: string, status: string): Promise<ActionResult> {
  if (typeof id !== "string" || !UUID.test(id) || !STATUSES.includes(status as Status)) {
    return { ok: false, error: "That change could not be made." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const { data, error } = await supabase
    .from("booking_requests")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "Another booking already holds this time, so this one cannot be reopened or confirmed.",
      };
    }
    return { ok: false, error: "Sorry, that did not save. Please try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "That booking could not be changed. Please refresh the page." };
  }
  revalidatePath("/admin");
  return { ok: true };
}
