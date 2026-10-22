"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Supabase email OTPs are numeric; local config uses 6 digits, hosted may use up to 10.
const CODE_PATTERN = /^\d{6,10}$/;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Email a one-time code (not a magic link) to the given address. */
export async function sendCode(email: string): Promise<ActionResult> {
  const address = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(address)) {
    return {
      ok: false,
      error: "Please enter a valid email address, like name@example.com.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: { shouldCreateUser: true },
  });
  if (error) {
    return {
      ok: false,
      error:
        "We could not send a code just now. Please check your email address and try again in a minute.",
    };
  }
  return { ok: true };
}

/**
 * Check the code from the email. On success the session cookies are set and a
 * `client` profile is created if this person has none yet.
 */
export async function verifyCode(
  email: string,
  code: string,
): Promise<ActionResult> {
  const address = normalizeEmail(email);
  const token = code.replace(/\s+/g, "");
  const badCode = {
    ok: false,
    error:
      "That code did not work. It may be wrong or out of date. Check your newest email, or choose \"Resend code\" to get a new one.",
  } as const;

  if (!CODE_PATTERN.test(token)) return badCode;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: address,
    token,
    type: "email",
  });
  if (error || !data?.user || !data.session) return badCode;

  // First login creates the profile; later logins leave it untouched
  // (ignoreDuplicates) so an existing trainer is never downgraded to a client.
  const { error: profileError } = await createAdminClient()
    .from("profiles")
    .upsert(
      { id: data.user.id, role: "client" },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (profileError) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "We could not finish signing you in. Please try again in a moment.",
    };
  }

  return { ok: true };
}
