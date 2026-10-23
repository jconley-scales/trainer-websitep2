import "server-only";
import nodemailer from "nodemailer";
import { formatDate, formatTimeRange } from "@/lib/format";
import { SITE } from "@/lib/site";

export type NewBooking = {
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  startsAt: string;
  endsAt: string;
};

/**
 * Email the trainer about a new booking request.
 *
 * Sent over plain SMTP so it works with any provider (and, locally, with the
 * Supabase mail viewer on port 54325). Configure with env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" for 465)
 *   BOOKING_NOTIFY_EMAIL  who to tell (the trainer)
 *   BOOKING_FROM_EMAIL    the sender address (defaults to BOOKING_NOTIFY_EMAIL)
 *   SITE_URL              used for the link to /admin (default http://localhost:3000)
 *
 * If it is not configured this logs a warning and does nothing: a missing
 * email must never lose a booking (the request is already saved).
 * The body is plain text, so nothing a visitor typed is ever rendered as HTML.
 */
export async function notifyTrainerOfBooking(booking: NewBooking): Promise<void> {
  const host = process.env.SMTP_HOST;
  const to = process.env.BOOKING_NOTIFY_EMAIL;
  if (!host || !to) {
    console.warn("Booking notification skipped: set SMTP_HOST and BOOKING_NOTIFY_EMAIL to enable it.");
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });

  // Visitor input goes into a header; strip line breaks so it stays one line.
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const when = `${formatDate(booking.startsAt)}, ${formatTimeRange(booking.startsAt, booking.endsAt)}`;
  const siteUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const text = [
    `New booking request for ${SITE.name}.`,
    "",
    `When:  ${when}`,
    `Name:  ${booking.name}`,
    `Email: ${booking.email}`,
    `Phone: ${booking.phone ?? "(not given)"}`,
    "",
    booking.note ? `Note:\n${booking.note}` : "Note: (none)",
    "",
    "This is a request, not yet confirmed. Confirm or cancel it here:",
    `${siteUrl}/admin`,
  ].join("\n");

  await transport.sendMail({
    from: process.env.BOOKING_FROM_EMAIL ?? to,
    to,
    replyTo: booking.email,
    subject: oneLine(`New booking request: ${when} — ${booking.name}`),
    text,
  });
}
