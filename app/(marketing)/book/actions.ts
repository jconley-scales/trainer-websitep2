"use server";

import { availableDays } from "@/lib/booking-availability";
import { createPublicClient } from "@/lib/supabase/public";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BookingResult = { ok: true } | { ok: false; error: string };

export type BookingInput = {
  name: string;
  email: string;
  phone: string;
  note: string;
  startsAt: string;
  endsAt: string;
};

/**
 * Save a public booking request. Reachable by direct POST, so it re-validates
 * everything: the contact fields, and that the chosen time is a real, still-open
 * slot (not an arbitrary time posted by hand). Writes with the anon client, so
 * row level security allows only the insert.
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
    return { ok: false, error: "That time is no longer available. Please choose another." };
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
    return {
      ok: false,
      error: "Sorry, we could not save your request just now. Please try again in a moment.",
    };
  }
  return { ok: true };
}
