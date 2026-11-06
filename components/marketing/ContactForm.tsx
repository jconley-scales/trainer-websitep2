"use client";

import { useState, useTransition, type FormEvent } from "react";
import { submitContactMessage } from "@/app/(marketing)/contact/actions";
import { SITE } from "@/lib/site";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * The contact form. Submitting sends the message to the trainer by email from
 * the server, so the trainer's own address is never shown on the site.
 *
 * Privacy: before the page is interactive the browser would submit the form
 * natively, and a GET would put the visitor's details in the URL. So the form
 * is `method="post"` and the submit button stays disabled until hydration.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitContactMessage({ name, email, phone, message, website });
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  }

  if (sent) {
    return (
      <div className="contact-form stack" role="status">
        <h2 className="contact-form-title">Thank you, your message is on its way</h2>
        <p>
          {SITE.trainerFirstName} will reply to <strong>{email.trim()}</strong> as
          soon as he can.
        </p>
      </div>
    );
  }

  return (
    <form
      className="contact-form stack"
      method="post"
      action="#"
      onSubmit={handleSubmit}
      aria-labelledby="contact-form-title"
    >
      <h2 id="contact-form-title" className="contact-form-title">
        Send {SITE.trainerFirstName} a message
      </h2>
      <p className="contact-form-help">
        Ask a question or tell {SITE.trainerFirstName} about your goals. He will
        reply by email.
      </p>
      <div className="field">
        <label htmlFor="contact-name">Your name</label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="contact-email">Your email</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="contact-phone">Your phone number (optional)</label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={40}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="contact-message">Your message</label>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      {/* Honeypot for spam bots: off-screen and out of the tab order. */}
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor="contact-website">Leave this empty</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button--accent" disabled={!hydrated || pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
