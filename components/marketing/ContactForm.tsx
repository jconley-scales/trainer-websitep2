"use client";

import { useState, type FormEvent } from "react";
import { buildMailto, composeContactBody } from "@/lib/contact";
import { SITE } from "@/lib/site";

/**
 * A simple message form. There is no server: submitting composes a `mailto:`
 * link and opens the visitor's own email app with the message ready to send.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    window.location.href = buildMailto({
      to: SITE.email,
      subject: "Free consultation",
      body: composeContactBody({
        trainerFirstName: SITE.trainerFirstName,
        name,
        phone,
        message,
      }),
    });
  }

  return (
    <form
      className="contact-form stack"
      onSubmit={handleSubmit}
      aria-labelledby="contact-form-title"
    >
      <h2 id="contact-form-title" className="contact-form-title">
        Or write me a message
      </h2>
      <p className="contact-form-help">
        When you press the button, your email app opens with your message ready
        to send. Nothing is sent until you press send there.
      </p>
      <div className="field">
        <label htmlFor="contact-name">Your name</label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="contact-phone">Your phone number (optional)</label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
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
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <button type="submit" className="button--accent">
        Open my email app
      </button>
    </form>
  );
}
