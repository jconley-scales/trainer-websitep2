import "server-only";
import nodemailer from "nodemailer";
import {
  firstName,
  formatDate,
  formatDayMonth,
  formatDayMonthTime,
  formatTimeRange,
  formatTimeZoneName,
} from "@/lib/format";
import { SITE } from "@/lib/site";

/** Visitor input goes into a header; strip line breaks so it stays one line. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/**
 * The SMTP transport and the booking sender address, or null when email is not
 * configured. The privacy page names the email provider (`SITE.privacy` in
 * lib/site.ts): update it if the SMTP provider changes. Shared by every email
 * the site sends, to the trainer or to a client.
 */
function mailer() {
  const host = process.env.SMTP_HOST;
  const from = process.env.BOOKING_FROM_EMAIL ?? process.env.BOOKING_NOTIFY_EMAIL;
  if (!host || !from) return null;
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return { transport, from };
}

/** The mailer plus the trainer's address, or null when either is not configured. */
function trainerMailer() {
  const to = process.env.BOOKING_NOTIFY_EMAIL;
  const m = mailer();
  if (!to || !m) return null;
  return { ...m, to };
}

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
  const mailer = trainerMailer();
  if (!mailer) {
    console.warn("Booking notification skipped: set SMTP_HOST and BOOKING_NOTIFY_EMAIL to enable it.");
    return;
  }
  const { transport, to, from } = mailer;
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
    from,
    to,
    replyTo: booking.email,
    subject: oneLine(`New booking request: ${when} — ${booking.name}`),
    text,
  });
}

export type ContactMessage = {
  name: string;
  email: string;
  phone: string | null;
  message: string;
};

/**
 * Email the trainer a message from the contact form, with Reply-To set to the
 * visitor so the trainer can simply reply. Uses the same SMTP settings and
 * address as booking notifications, so the trainer's email is never published.
 *
 * Unlike a booking, the message is not saved anywhere else, so this throws when
 * email is not configured or sending fails: the visitor must be told.
 */
export async function sendContactMessage(msg: ContactMessage): Promise<void> {
  const mailer = trainerMailer();
  if (!mailer) {
    throw new Error("Contact form email is not configured: set SMTP_HOST and BOOKING_NOTIFY_EMAIL.");
  }
  const { transport, to, from } = mailer;
  const text = [
    `New message from the ${SITE.name} contact form.`,
    "",
    `Name:  ${msg.name}`,
    `Email: ${msg.email}`,
    `Phone: ${msg.phone ?? "(not given)"}`,
    "",
    msg.message,
    "",
    "Reply to this email to answer them.",
  ].join("\n");

  await transport.sendMail({
    from,
    to,
    replyTo: msg.email,
    subject: oneLine(`Website message from ${msg.name}`),
    text,
  });
}

export type BookingConfirmation = {
  name: string;
  email: string;
  startsAt: string;
  endsAt: string;
  /** Optional words from the trainer (e.g. where to meet). Only ever emailed. */
  note: string;
};

/**
 * Email a client that their session is confirmed. Replies go to the booking
 * address, so they reach the trainer. Throws when email is not configured or
 * sending fails, so the caller can tell the trainer to get in touch instead.
 */
export async function sendBookingConfirmation(booking: BookingConfirmation): Promise<void> {
  const m = mailer();
  if (!m) {
    throw new Error("Confirmation email is not configured: set SMTP_HOST and BOOKING_FROM_EMAIL (or BOOKING_NOTIFY_EMAIL).");
  }
  const day = formatDayMonth(booking.startsAt);
  const note = booking.note.trim();

  // Plain text, laid out so the day and time stand out on their own lines.
  const text = [
    `Hi ${firstName(booking.name)},`,
    "",
    "Your session is confirmed.",
    "",
    `    ${day}`,
    `    ${formatTimeRange(booking.startsAt, booking.endsAt)} (${formatTimeZoneName(booking.startsAt)})`,
    "",
    ...(note ? [`A note from ${SITE.trainerFirstName}:`, note, ""] : []),
    "If you need to change or cancel, just reply to this email.",
    "",
    "See you then,",
    SITE.trainer,
  ].join("\n");

  await m.transport.sendMail({
    from: m.from,
    to: oneLine(booking.email),
    replyTo: m.from,
    subject: oneLine(`Confirmed: ${formatDayMonthTime(booking.startsAt)}`),
    text,
  });
}
