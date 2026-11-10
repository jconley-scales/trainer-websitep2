"use server";

import { after } from "next/server";
import { availabilityWindow, availableDays, BREAK_MINUTES, clashesWithTaken, type TakenTime } from "@/lib/booking-availability";
import { notifyTrainerOfBooking } from "@/lib/notify";
import { isSessionType, SESSION_TYPE_REQUIRED, sessionTypeFormat, type SessionType } from "@/lib/session-types";
import { SITE } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/public";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIQUE_VIOLATION = "23505";
/** Raised by the database when one email already holds too many live requests (migration 0006). */
const TOO_MANY_LIVE_REQUESTS = "PF001";

export type BookingResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** Someone else holds that time: the page refreshes the calendar. */
      taken?: boolean;
      /** This email already has the most waiting requests allowed: the page links to contact. */
      limitReached?: boolean;
    };

export type BookingInput = {
  name: string;
  email: string;
  phone: string;
  note: string;
  startsAt: string;
  endsAt: string;
  /** 1-on-1, Partner or a virtual one. Required; null only before the visitor has chosen. */
  sessionType: SessionType | null;
  /** Bot trap: hidden from people, so only bots fill it in. */
  website?: string;
};

/**
 * The times (start and end) held by live bookings that overlap `from`–`to`,
 * through the SECURITY DEFINER function, which returns times only — never who
 * booked them. Null if the lookup fails.
 */
async function takenBetween(from: string, to: string): Promise<TakenTime[] | null> {
  const { data, error } = await createPublicClient().rpc("taken_booking_times", { p_from: from, p_to: to });
  if (error || !Array.isArray(data)) return null;
  return (data as { starts_at: string; ends_at: string }[])
    .map((row) => ({ start: Date.parse(row.starts_at), end: Date.parse(row.ends_at) }))
    .filter((t) => !Number.isNaN(t.start) && !Number.isNaN(t.end));
}

/**
 * The times already held by a live booking, over the window the booking page
 * shows, so it can hide every slot they overlap or sit too close to. On failure returns [] so the
 * page still works; submitBooking checks again, and the unique index is what
 * really prevents two bookings at one start time.
 */
export async function getTakenTimes(): Promise<TakenTime[]> {
  const { from, to } = availabilityWindow(new Date());
  return (await takenBetween(from.toISOString(), to.toISOString())) ?? [];
}

/**
 * Save a public booking request. Reachable by direct POST, so it re-validates
 * everything: the contact fields, and that the chosen time is a real, still-open
 * slot of the chosen session type's schedule (not an arbitrary time posted by
 * hand) that no live booking overlaps or sits too close to. Writes with the anon client, so
 * row level security allows only the insert. The database's unique index turns
 * a time someone else already holds into a friendly "just taken" message, and
 * its per-email limit on waiting requests into a friendly "you have a few
 * waiting" one.
 */
export async function submitBooking(input: BookingInput): Promise<BookingResult> {
  // A bot filled the hidden field: pretend it worked, and save and send nothing.
  if ((input.website ?? "").trim()) return { ok: true };

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").trim();
  const note = (input.note ?? "").trim();
  const sessionType = input.sessionType;

  if (!isSessionType(sessionType)) {
    return { ok: false, error: SESSION_TYPE_REQUIRED };
  }
  if (!name || name.length > 120) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    return { ok: false, error: "Please enter a valid email address, like name@example.com." };
  }
  if (phone.length > 40) {
    return { ok: false, error: "That phone number looks too long. Please check it." };
  }
  if (note.length > 2000) {
    return { ok: false, error: "Please shorten your message a little." };
  }

  // The time must be one of the real, future slots we offer for this kind of
  // session (virtual sessions have their own schedule).
  const slot = availableDays(new Date(), sessionTypeFormat(sessionType))
    .flatMap((day) => day.slots)
    .find((s) => s.startsAt === input.startsAt && s.endsAt === input.endsAt);
  if (!slot) {
    return { ok: false, error: "That time is no longer available. Please choose another.", taken: true };
  }

  const justTaken = {
    ok: false,
    error: "Sorry, someone has just booked that time. Please choose another.",
    taken: true,
  } as const;

  // The unique index only catches a booking at the same start time; one at
  // another time (an admin booking, or a slot from the other schedule) may
  // still cover part of this slot or leave the trainer less than the break.
  // If the lookup fails, carry on: the index still guards the start time.
  const breakMs = BREAK_MINUTES * 60000;
  const taken = await takenBetween(
    new Date(Date.parse(slot.startsAt) - breakMs).toISOString(),
    new Date(Date.parse(slot.endsAt) + breakMs).toISOString(),
  );
  if (taken && clashesWithTaken(slot, taken)) return justTaken;

  const db = createPublicClient();
  const { error } = await db.from("booking_requests").insert({
    name,
    email,
    phone: phone || null,
    note: note || null,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
    session_type: sessionType,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return justTaken;
    if (error.code === TOO_MANY_LIVE_REQUESTS) {
      return {
        ok: false,
        error: `You already have a few requests waiting. ${SITE.trainerFirstName} will be in touch soon, or send a message if you need to change one.`,
        limitReached: true,
      };
    }
    return {
      ok: false,
      error: "Sorry, we could not save your request just now. Please try again in a moment.",
    };
  }

  // Tell the trainer after the response is sent, so a slow mail server never
  // delays the visitor, and a mail failure never undoes a saved booking.
  after(async () => {
    try {
      await notifyTrainerOfBooking({
        name,
        email,
        phone: phone || null,
        note: note || null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        sessionType,
      });
    } catch (err) {
      console.error("Booking saved, but the notification email failed:", err);
    }
  });

  return { ok: true };
}
