"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gymTimeToUtc } from "@/lib/booking-availability";
import { firstName, formatTime } from "@/lib/format";
import { sendBookingCancellation, sendBookingConfirmation, sendBookingMoved } from "@/lib/notify";
import { isSessionType, toSessionType, type SessionType } from "@/lib/session-types";
import { createClient } from "@/lib/supabase/server";
import {
  BOOKING_EMAIL_MAX,
  BOOKING_LENGTHS,
  BOOKING_NAME_MAX,
  BOOKING_NOTE_MAX,
  BOOKING_PHONE_MAX,
  BOOKING_STEP_MINUTES,
  CANCEL_REASON_MAX,
  CONFIRM_NOTE_MAX,
} from "./limits";

export type ActionResult = { ok: true } | { ok: false; error: string };
/**
 * `emailed` is false when the booking was confirmed but the client's email did
 * not send, and null when no email was sent on purpose: the booking has no
 * email (an admin booking), or the trainer chose "Don't email the client".
 */
export type ConfirmResult = { ok: true; emailed: boolean | null } | { ok: false; error: string };
/** `emailed` as for ConfirmResult, for a cancelled booking. */
export type CancelResult = ConfirmResult;
/** `sentTo` is the address the email went to, so the trainer can check it. */
export type ResendResult = { ok: true; sentTo: string } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Supabase email codes are numeric; local config uses 6 digits, hosted may use up to 10.
const CODE_PATTERN = /^\d{6,10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Confirming and cancelling go through confirmBooking and cancelBooking, which also email the client.
const STATUSES = ["new"] as const;
type Status = (typeof STATUSES)[number];

const UNIQUE_VIOLATION = "23505";
// Raised by the database (migration 0010) when a cancelled or started booking is edited.
const NOT_EDITABLE = "PF002";

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
 * if it did not send, and the booking stays confirmed either way. `skipEmail`
 * (only a real `true`) confirms without emailing, for a client the trainer has
 * already told; a booking with no email is never emailed whatever it says.
 */
export async function confirmBooking(id: string, note: string, skipEmail = false): Promise<ConfirmResult> {
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
    .select("name, email, starts_at, ends_at, session_type");
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
  if (!booking.email || skipEmail === true) return { ok: true, emailed: null };

  try {
    await sendBookingConfirmation({
      name: booking.name,
      email: booking.email,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      note: trimmedNote,
      sessionType: toSessionType(booking.session_type),
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
 * cancelled whether or not it sends, and `skipEmail` sends nothing.
 */
export async function cancelBooking(id: string, reason: string, skipEmail = false): Promise<CancelResult> {
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
  if (!booking.email || skipEmail === true) return { ok: true, emailed: null };

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

/**
 * Send a confirmed booking's Confirmed email again, as it was first sent but
 * without the original note (which was never stored): for a client who can't
 * find it, or after the trainer corrects their email. Writes nothing.
 */
export async function resendConfirmation(id: string): Promise<ResendResult> {
  if (typeof id !== "string" || !UUID.test(id)) {
    return { ok: false, error: "That email could not be sent." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  // Row level security returns nothing to anyone but an admin.
  const { data, error } = await supabase
    .from("booking_requests")
    .select("name, email, starts_at, ends_at, session_type")
    .eq("id", id)
    .eq("status", "confirmed");
  if (error) return { ok: false, error: "Sorry, that did not send. Please try again." };
  const booking = data?.[0];
  if (!booking) {
    return {
      ok: false,
      error: "This booking isn't confirmed any more, so there's nothing to resend. Please refresh the page.",
    };
  }
  if (Date.parse(booking.starts_at) <= Date.now()) {
    return { ok: false, error: "This session has already started, so there's no need to resend its confirmation." };
  }
  if (!booking.email) {
    return { ok: false, error: "This booking has no email address. Add one with Edit, or let them know yourself." };
  }
  try {
    await sendBookingConfirmation({
      name: booking.name,
      email: booking.email,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      note: "",
      sessionType: toSessionType(booking.session_type),
    });
  } catch (err) {
    console.error("Booking confirmation email could not be resent:", err);
    return {
      ok: false,
      error: `The email to ${firstName(booking.name)} didn't send. Please try again in a few minutes, or call or email them yourself.`,
    };
  }
  return { ok: true, sentTo: booking.email };
}

export type AddBookingInput = {
  name: string;
  /** Optional: when given, the client gets the Confirmed email. */
  email: string;
  phone: string;
  note: string;
  /** The gym-zone calendar date, "YYYY-MM-DD". */
  date: string;
  /** The gym-zone start time, "HH:MM" (24h), on the quarter hour. */
  time: string;
  /** The session length in minutes, one of BOOKING_LENGTHS. */
  minutes: number;
  /**
   * Required when adding. Null only when editing a booking made before session
   * types were recorded, to leave it unrecorded; a type once set can't be cleared.
   */
  sessionType: SessionType | null;
  /** Save even though it overlaps another live booking (after the trainer saw the warning). */
  allowOverlap?: boolean;
};

/**
 * `emailed` is null when no email was given, false when the Confirmed email did
 * not send. `overlap` is set when the booking was not saved only because it
 * overlaps another: the trainer may choose to save it anyway.
 */
export type AddBookingResult =
  | { ok: true; emailed: boolean | null }
  | { ok: false; error: string; overlap?: true };

const CLASH = "Another booking already holds that time. Please choose another.";
const SESSION_TYPE_MISSING = "Please choose the kind of session.";

type ParsedBooking = {
  name: string;
  email: string;
  phone: string;
  note: string;
  startsAt: string;
  endsAt: string;
  /** Null when none was chosen; addBooking and editBooking decide whether that's allowed. */
  sessionType: SessionType | null;
};

/**
 * Check and tidy the booking form's fields, as posted (so anything may arrive):
 * the shared rules for adding and editing a booking. The time must be a future
 * quarter hour, for one of BOOKING_LENGTHS.
 */
function parseBookingFields(
  input: AddBookingInput,
): ({ ok: true } & ParsedBooking) | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false, error }) as const;
  if (
    !input ||
    typeof input !== "object" ||
    !["name", "email", "phone", "note", "date", "time"].every(
      (k) => typeof input[k as keyof AddBookingInput] === "string",
    ) ||
    typeof input.minutes !== "number"
  ) {
    return fail("That booking could not be saved.");
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const note = input.note.trim();

  if (!name) return fail("Please enter the client's name.");
  if (name.length > BOOKING_NAME_MAX) {
    return fail(`Please shorten the name to ${BOOKING_NAME_MAX} characters or fewer.`);
  }
  const sessionType = input.sessionType ?? null;
  if (sessionType !== null && !isSessionType(sessionType)) return fail(SESSION_TYPE_MISSING);
  if (email && (!EMAIL_PATTERN.test(email) || email.length > BOOKING_EMAIL_MAX)) {
    return fail("Please check the email address, or leave it blank.");
  }
  if (phone.length > BOOKING_PHONE_MAX) return fail("That phone number looks too long. Please check it.");
  if (note.length > BOOKING_NOTE_MAX) {
    return fail(`Please shorten the note to ${BOOKING_NOTE_MAX} characters or fewer.`);
  }
  const start = gymTimeToUtc(input.date, input.time);
  if (!start) return fail("Please choose a date and a start time.");
  if (Number(input.time.slice(3)) % BOOKING_STEP_MINUTES !== 0) {
    return fail("Please choose a start time on the quarter hour.");
  }
  if (!BOOKING_LENGTHS.includes(input.minutes)) return fail("Please choose how long the session is.");
  if (start.getTime() <= Date.now()) return fail("Please choose a time that hasn't passed yet.");

  return {
    ok: true,
    name,
    email,
    phone,
    note,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + input.minutes * 60_000).toISOString(),
    sessionType,
  };
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Why a booking may not be saved at startsAt–endsAt, or null when it may: a
 * live booking at the exact same start blocks it (as the database's unique
 * index would); one that merely overlaps is named in a warning, unless
 * `allowOverlap`. `exceptId` leaves out the booking being moved.
 */
async function checkOverlaps(
  supabase: ServerClient,
  startsAt: string,
  endsAt: string,
  allowOverlap: boolean,
  exceptId?: string,
): Promise<{ ok: false; error: string; overlap?: true } | null> {
  let query = supabase
    .from("booking_requests")
    .select("name, starts_at")
    .neq("status", "cancelled")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query.order("starts_at", { ascending: true });
  if (error) return { ok: false, error: "Sorry, that did not save. Please try again." };
  const overlaps = (data ?? []) as { name: string; starts_at: string }[];
  if (overlaps.some((b) => Date.parse(b.starts_at) === Date.parse(startsAt))) return { ok: false, error: CLASH };
  if (overlaps.length > 0 && !allowOverlap) {
    const named = overlaps.map((b) => `${firstName(b.name)}'s ${formatTime(b.starts_at)} session`);
    return { ok: false, overlap: true, error: `This overlaps ${named.join(" and ")}.` };
  }
  return null;
}

/**
 * Add an admin booking: one the trainer arranged with a client by phone or
 * text. Any future date and quarter-hour time, not just the public schedule
 * (whatever the session type, which is required); saved as confirmed; no
 * per-email cap (see docs/adr/0001-admin-bookings.md).
 *
 * Reachable by direct POST, so it re-checks every field and the session; the
 * insert runs as the signed-in user, so row level security only lets an admin
 * add it. A live booking at the exact same start blocks it (as the database's
 * unique index would); one that merely overlaps is named in a warning, unless
 * `allowOverlap` is set.
 *
 * If an email is given the client gets the Confirmed email, and, like
 * confirmBooking, this waits for it and the booking stays saved either way.
 * The trainer gets no new-booking email: they added it themself.
 */
export async function addBooking(input: AddBookingInput): Promise<AddBookingResult> {
  const parsed = parseBookingFields(input);
  if (!parsed.ok) return parsed;
  const { name, email, phone, note, startsAt, endsAt, sessionType } = parsed;
  const fail = (error: string) => ({ ok: false, error }) as const;
  if (!sessionType) return fail(SESSION_TYPE_MISSING);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const failed = fail("Sorry, that did not save. Please try again.");

  const blocked = await checkOverlaps(supabase, startsAt, endsAt, input.allowOverlap === true);
  if (blocked) return blocked;

  const { error } = await supabase.from("booking_requests").insert({
    name,
    email: email || null,
    phone: phone || null,
    note: note || null,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "confirmed",
    source: "admin",
    session_type: sessionType,
  });
  if (error) return error.code === UNIQUE_VIOLATION ? fail(CLASH) : failed;
  revalidatePath("/admin");

  if (!email) return { ok: true, emailed: null };
  try {
    await sendBookingConfirmation({ name, email, startsAt, endsAt, note: "", sessionType });
  } catch (err) {
    console.error("Booking confirmation email could not be sent:", err);
    return { ok: true, emailed: false };
  }
  return { ok: true, emailed: true };
}

export type EditBookingInput = AddBookingInput & {
  /** The booking being changed. */
  id: string;
  /** Don't send the moved or Confirmed email a new time would otherwise send. */
  skipEmail?: boolean;
};

/**
 * `moved` when the start or end changed; `confirmed` when that also confirmed
 * a new request. `emailed` is null when no email was sent (details only, the
 * trainer chose not to, or no email on file), false when it did not send.
 * `overlap` as for AddBookingResult.
 */
export type EditBookingResult =
  | { ok: true; moved: boolean; confirmed: boolean; emailed: boolean | null }
  | { ok: false; error: string; overlap?: true };

/**
 * Edit or move a live, future booking (website or admin) from /admin. The
 * fields and the new time follow addBooking's rules; `source` never changes,
 * and a website booking keeps an email (the database requires one). The
 * session type is one of the details: it may be left unrecorded only on a
 * booking made before session types, and once recorded can't be cleared.
 *
 * Changing only the details emails nobody. Moving a confirmed booking emails
 * the client the old and new times; moving a new request also confirms it, and
 * the client gets the Confirmed email for the new time. `skipEmail` sends
 * neither. Like confirmBooking, this waits for the email, and the edit stays
 * saved whether or not it sends.
 *
 * Reachable by direct POST, so it re-checks every field and the session; the
 * update runs as the signed-in user, so row level security only lets an admin
 * change the row. It only matches the booking as it was read, so a change made
 * in between (another tab) saves nothing and sends nothing.
 */
export async function editBooking(input: EditBookingInput): Promise<EditBookingResult> {
  if (!input || typeof input !== "object" || typeof input.id !== "string" || !UUID.test(input.id)) {
    return { ok: false, error: "That booking could not be saved." };
  }
  const parsed = parseBookingFields(input);
  if (!parsed.ok) return parsed;
  const { name, email, phone, note, startsAt, endsAt, sessionType } = parsed;
  const fail = (error: string) => ({ ok: false, error }) as const;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const failed = fail("Sorry, that did not save. Please try again.");
  const notChanged = fail("That booking could not be changed. Please refresh the page.");

  const { data: rows, error: readError } = await supabase
    .from("booking_requests")
    .select("status, source, email, starts_at, ends_at, session_type")
    .eq("id", input.id)
    .in("status", ["new", "confirmed"]);
  if (readError) return failed;
  const current = rows?.[0] as
    | {
        status: "new" | "confirmed";
        source: "website" | "admin";
        email: string | null;
        starts_at: string;
        ends_at: string;
        session_type: string | null;
      }
    | undefined;
  if (!current) return notChanged;
  const started = fail("This session has already started, so it can't be changed.");
  if (Date.parse(current.starts_at) <= Date.now()) return started;
  if (current.source === "website" && !email) {
    return fail("A booking made on the website needs an email address. Please add one.");
  }
  // Only a booking made before session types may go without one, and a type once set stays.
  if (!sessionType && current.session_type !== null) return fail(SESSION_TYPE_MISSING);

  const moved =
    Date.parse(current.starts_at) !== Date.parse(startsAt) || Date.parse(current.ends_at) !== Date.parse(endsAt);
  if (moved) {
    const blocked = await checkOverlaps(supabase, startsAt, endsAt, input.allowOverlap === true, input.id);
    if (blocked) return blocked;
  }
  const confirmed = moved && current.status === "new";

  const { data, error } = await supabase
    .from("booking_requests")
    .update({
      name,
      email: email || null,
      phone: phone || null,
      note: note || null,
      starts_at: startsAt,
      ends_at: endsAt,
      ...(sessionType ? { session_type: sessionType } : {}),
      ...(confirmed ? { status: "confirmed" } : {}),
    })
    .eq("id", input.id)
    .eq("status", current.status)
    .eq("starts_at", current.starts_at)
    .select("id");
  if (error) {
    // It started (or was cancelled in another tab) between the read and the save.
    if (error.code === NOT_EDITABLE) return started;
    return error.code === UNIQUE_VIOLATION ? fail(CLASH) : failed;
  }
  if (!data || data.length === 0) return notChanged;
  revalidatePath("/admin");

  const done = { ok: true, moved, confirmed } as const;
  if (!moved || !email || input.skipEmail === true) return { ...done, emailed: null };
  try {
    if (confirmed) {
      await sendBookingConfirmation({ name, email, startsAt, endsAt, note: "", sessionType });
    } else {
      await sendBookingMoved({ name, email, oldStartsAt: current.starts_at, startsAt, endsAt, sessionType });
    }
  } catch (err) {
    console.error(`Booking ${confirmed ? "confirmation" : "moved"} email could not be sent:`, err);
    return { ...done, emailed: false };
  }
  return { ...done, emailed: true };
}
