"use server";

import { sendContactMessage } from "@/lib/notify";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactInput = {
  name: string;
  email: string;
  phone: string;
  message: string;
  /** Honeypot: hidden from people, so only bots fill it in. */
  website?: string;
};

export type ContactResult = { ok: true } | { ok: false; error: string };

/**
 * Email a contact-form message to the trainer. Reachable by direct POST, so it
 * validates everything itself. Nothing is stored; if the email cannot be sent
 * the visitor is told, so a message is never silently lost.
 */
export async function submitContactMessage(input: ContactInput): Promise<ContactResult> {
  // A bot filled the hidden field: pretend it worked and send nothing.
  if ((input.website ?? "").trim()) return { ok: true };

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").trim();
  const message = (input.message ?? "").trim();

  if (!name || name.length > 120) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    return { ok: false, error: "Please enter a valid email address, like name@example.com." };
  }
  if (phone.length > 40) {
    return { ok: false, error: "That phone number looks too long. Please check it." };
  }
  if (!message) {
    return { ok: false, error: "Please write a message." };
  }
  if (message.length > 4000) {
    return { ok: false, error: "Please shorten your message a little." };
  }

  try {
    await sendContactMessage({ name, email, phone: phone || null, message });
  } catch (err) {
    console.error("Contact message could not be sent:", err);
    return {
      ok: false,
      error:
        "Sorry, your message could not be sent just now. Please try again in a moment, or book a session instead.",
    };
  }
  return { ok: true };
}
