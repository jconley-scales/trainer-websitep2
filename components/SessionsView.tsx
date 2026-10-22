"use client";

import { useEffect, useState } from "react";
import { SessionCard, type SessionCardData } from "./SessionCard";

type SessionsViewProps = {
  sessions: SessionCardData[];
  cancelAction: (bookingId: string) => Promise<void>;
  /**
   * Set when the client has just booked a session (the book screen sends them
   * here). The server only supplies it once the session really is in `sessions`.
   */
  bookedMessage?: string | null;
};

/** How long to wait for the list to catch up after a cancel before saying so. */
const CONFIRM_TIMEOUT_MS = 8000;

/** Short pause so the empty live region is in the page before its text arrives. */
const ANNOUNCE_DELAY_MS = 200;

/**
 * Move focus to the page heading. The router keeps screens you have visited in the
 * page (hidden), so a previous copy of this heading, with the same id, can still
 * be in the document: pick the one that is actually showing.
 */
function focusHeading() {
  const headings = document.querySelectorAll<HTMLElement>("#sessions-heading");
  Array.from(headings)
    .find((h) => h.getClientRects().length > 0)
    ?.focus();
}

type Cancelled = { id: string; label: string };

/**
 * The list of session cards plus a persistent status message.
 *
 * The message cannot live in a card (a cancelled card unmounts), so this wrapper
 * stays mounted across refreshes and owns a `role="status"` live region that is
 * always in the page. Screen readers announce changes to it (WCAG 4.1.3) and it
 * stays on screen until the next cancel replaces it.
 *
 * The success message is tied to the list actually changing: it is derived from
 * the refreshed list no longer containing the session, not from the server action
 * merely returning. If the session is still listed after a while, we say so
 * instead of claiming success.
 *
 * The same region also confirms a booking made on the book screen (the
 * `bookedMessage` prop), so there is exactly one place where results are
 * announced. A cancel made afterwards replaces it.
 */
export function SessionsView({ sessions, cancelAction, bookedMessage = null }: SessionsViewProps) {
  // The session we last asked the server to cancel (never cleared; replaced by the next one).
  const [cancelled, setCancelled] = useState<Cancelled | null>(null);
  const [timedOutId, setTimedOutId] = useState<string | null>(null);

  const stillListed = cancelled ? sessions.some((s) => s.id === cancelled.id) : false;
  const confirmed = cancelled !== null && !stillListed;
  const unconfirmed = cancelled !== null && timedOutId === cancelled.id && stillListed;

  // Give the list time to catch up; if the session is still there, say so.
  useEffect(() => {
    if (!cancelled || !stillListed) return;
    const timer = setTimeout(() => setTimedOutId(cancelled.id), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cancelled, stillListed]);

  // The cancelled card (and its modal dialog) is gone, so keyboard and screen
  // reader users would lose their place: send them to the heading.
  useEffect(() => {
    if (confirmed) focusHeading();
  }, [confirmed, cancelled]);

  // A live region only announces changes, and text that is already in the page
  // when the region first appears is often skipped. So the booking message is put
  // into the (already present, empty) region a moment after mount, which gets it
  // announced.
  const [bookedShown, setBookedShown] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setBookedShown(bookedMessage), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [bookedMessage]);

  // Arriving from the book screen: send keyboard and screen reader users to the
  // heading so they start reading from the top, with the message right below it.
  useEffect(() => {
    if (bookedShown) focusHeading();
  }, [bookedShown]);

  async function cancel(card: SessionCardData) {
    await cancelAction(card.id);
    setCancelled({ id: card.id, label: `${card.dateLabel} at ${card.startLabel}` });
  }

  // Once the client has cancelled something, that result takes over the region.
  let message: string | null = cancelled === null ? bookedShown : null;
  let isError = false;
  if (confirmed) message = `Your session on ${cancelled.label} has been cancelled.`;
  else if (unconfirmed) {
    isError = true;
    message = `We could not confirm that your session on ${cancelled.label} was cancelled. Please refresh the page and check your list.`;
  }

  return (
    <>
      <div
        role="status"
        className={message ? (isError ? "error-message" : "notice-message") : undefined}
      >
        {message}
      </div>
      {sessions.length === 0 ? (
        <p className="empty-state">
          You have no upcoming sessions. Choose &ldquo;Book a session&rdquo; to
          pick a time.
        </p>
      ) : (
        <ul className="session-list" role="list">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} cancelAction={() => cancel(s)} />
          ))}
        </ul>
      )}
    </>
  );
}
