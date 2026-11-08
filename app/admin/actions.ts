"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendBookingCancellation, sendBookingConfirmation } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { CANCEL_REASON_MAX, CONFIRM_NOTE_MAX } from "./limits";

export type ActionResult = { ok: true } | { ok: false; error: string };
/** `emailed` is false when the booking was confirmed but the client's email did not send. */
export type ConfirmResult = { ok: true; emailed: boolean } | { ok: false; error: string };
/** `emailed` is false when the booking was cancelled but the client's email did not send. */
export type CancelResult = ConfirmResult;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Supabase email codes are numeric; local config uses 6 digits, hosted may use up to 10.
const CODE_PATTERN = /^\d{6,10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Confirming and cancelling go through confirmBooking and cancelBooking, which also email the client.
const STATUSES = ["new"] as const;
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
 * Re-open a cancelled booking request (no email). Reachable by direct POST, so it
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
    .eq("status", "cancelled")
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "Another booking already holds this time, so this one cannot be reopened.",
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

/**
 * Confirm a new booking request, then email the client, with the trainer's
 * optional note (never stored). Reachable by direct POST, so it re-checks its
 * input and the session. Only a "new" request is confirmed, so a repeat tap or
 * a second tab cannot email the client twice.
 *
 * Unlike the new-booking alert this waits for the email: the trainer is told
 * if it did not send, and the booking stays confirmed either way.
 */
export async function confirmBooking(id: string, note: string): Promise<ConfirmResult> {
  if (typeof id !== "string" || !UUID.test(id) || typeof note !== "string") {
    return { ok: false, error: "That change could not be made." };
  }
  const trimmedNote = note.trim();
  if (trimmedNote.length > CONFIRM_NOTE_MAX) {
    return { ok: false, error: `Please shorten the note to ${CONFIRM_NOTE_MAX} characters or fewer.` };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const { data, error } = await supabase
    .from("booking_requests")
    .update({ status: "confirmed" })
    .eq("id", id)
    .eq("status", "new")
    .select("name, email, starts_at, ends_at");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: "Another booking already holds this time, so this one cannot be confirmed." };
    }
    return { ok: false, error: "Sorry, that did not save. Please try again." };
  }
  const booking = data?.[0];
  if (!booking) {
    return { ok: false, error: "That booking could not be changed. Please refresh the page." };
  }
  revalidatePath("/admin");

  try {
    await sendBookingConfirmation({
      name: booking.name,
      email: booking.email,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      note: trimmedNote,
    });
  } catch (err) {
    console.error("Booking confirmation email could not be sent:", err);
    return { ok: true, emailed: false };
  }
  return { ok: true, emailed: true };
}

/**
 * Cancel a new request or a confirmed session, then email the client, with the
 * trainer's optional reason (never stored). A new request gets a "can't make
 * this time" email; a confirmed session gets a "session cancelled" one.
 * Reachable by direct POST, so it re-checks its input and the session.
 *
 * The update only matches the status that was just read, so if the booking
 * changed in between (another tab), nothing is cancelled and no email is sent.
 * Like confirmBooking, this waits for the email and the booking stays
 * cancelled whether or not it sends.
 */
export async function cancelBooking(id: string, reason: string): Promise<CancelResult> {
  if (typeof id !== "string" || !UUID.test(id) || typeof reason !== "string") {
    return { ok: false, error: "That change could not be made." };
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length > CANCEL_REASON_MAX) {
    return { ok: false, error: `Please shorten the reason to ${CANCEL_REASON_MAX} characters or fewer.` };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const notChanged = {
    ok: false,
    error: "That booking could not be changed. Please refresh the page.",
  } as const;
  const failed = { ok: false, error: "Sorry, that did not save. Please try again." } as const;

  const { data: rows, error: readError } = await supabase
    .from("booking_requests")
    .select("status, name, email, starts_at, ends_at")
    .eq("id", id)
    .in("status", ["new", "confirmed"]);
  if (readError) return failed;
  const booking = rows?.[0];
  if (!booking) return notChanged;

  const { data, error } = await supabase
    .from("booking_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", booking.status)
    .select("id");
  if (error) return failed;
  if (!data || data.length === 0) return notChanged;
  revalidatePath("/admin");

  try {
    await sendBookingCancellation({
      name: booking.name,
      email: booking.email,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      wasConfirmed: booking.status === "confirmed",
      reason: trimmedReason,
    });
  } catch (err) {
    console.error("Booking cancellation email could not be sent:", err);
    return { ok: true, emailed: false };
  }
  return { ok: true, emailed: true };
}
