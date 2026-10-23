"use server";

import { after } from "next/server";
import { availabilityWindow, availableDays } from "@/lib/booking-availability";
import { notifyTrainerOfBooking } from "@/lib/notify";
import { createPublicClient } from "@/lib/supabase/public";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIQUE_VIOLATION = "23505";

export type BookingResult =
  | { ok: true }
  | { ok: false; error: string; taken?: boolean };

export type BookingInput = {
  name: string;
  email: string;
  phone: string;
  note: string;
  startsAt: string;
  endsAt: string;
};

/**
 * The start instants (epoch ms) already held by a live booking, over the window
 * the booking page shows. Goes through the SECURITY DEFINER function, which
 * returns times only — never who booked them. On failure returns [] so the page
 * still works; the unique index is what really prevents double booking.
 */
export async function getTakenTimes(): Promise<number[]> {
  const { from, to } = availabilityWindow(new Date());
  const { data, error } = await createPublicClient().rpc("taken_booking_times", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error || !Array.isArray(data)) return [];
  return (data as string[]).map((t) => Date.parse(t)).filter((t) => !Number.isNaN(t));
}

/**
 * Save a public booking request. Reachable by direct POST, so it re-validates
 * everything: the contact fields, and that the chosen time is a real, still-open
 * slot (not an arbitrary time posted by hand). Writes with the anon client, so
 * row level security allows only the insert. The database's unique index turns
 * a time someone else already holds into a friendly "just taken" message.
 */
export async function submitBooking(input: BookingInput): Promise<BookingResult> {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").trim();
  const note = (input.note ?? "").trim();

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

  // The time must be one of the real, future slots we actually offer.
  const slot = availableDays(new Date())
    .flatMap((day) => day.slots)
    .find((s) => s.startsAt === input.startsAt && s.endsAt === input.endsAt);
  if (!slot) {
    return { ok: false, error: "That time is no longer available. Please choose another.", taken: true };
  }

  const db = createPublicClient();
  const { error } = await db.from("booking_requests").insert({
    name,
    email,
    phone: phone || null,
    note: note || null,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "Sorry, someone has just booked that time. Please choose another.",
        taken: true,
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
      });
    } catch (err) {
      console.error("Booking saved, but the notification email failed:", err);
    }
  });

  return { ok: true };
}
