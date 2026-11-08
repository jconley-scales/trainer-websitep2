"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { confirmBooking, setBookingStatus } from "./actions";
import { CONFIRM_NOTE_MAX } from "./limits";

type Status = "new" | "confirmed" | "cancelled";

/** The actions that make sense for each state, in priority order. */
const ACTIONS: Record<Status, { to: Status; label: string; className: string }[]> = {
  new: [
    { to: "confirmed", label: "Confirm", className: "button button--accent" },
    { to: "cancelled", label: "Cancel", className: "button button-danger" },
  ],
  confirmed: [{ to: "cancelled", label: "Cancel", className: "button button-danger" }],
  cancelled: [{ to: "new", label: "Reopen", className: "button button-secondary" }],
};

/** What happened after confirming, shown under the buttons. */
type Outcome = { kind: "emailed" | "not-emailed"; text: string };

export function BookingStatusButtons({
  id,
  status,
  who,
  clientFirstName,
  when,
}: {
  id: string;
  status: Status;
  /** e.g. "Jordan Tester on Friday, October 23", for button labels and the cancel check. */
  who: string;
  /** e.g. "Jordan", for the confirm panel. */
  clientFirstName: string;
  /** e.g. "Friday, October 23 at 9:00 AM", for the confirm panel. */
  when: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const questionId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const questionRef = useRef<HTMLParagraphElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);

  // Move focus into the panel when it opens, so a keyboard or screen reader user lands on the question.
  useEffect(() => {
    if (confirming) questionRef.current?.focus();
  }, [confirming]);

  // After confirming, the panel and the Confirm button are gone: focus the result instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  function change(to: Status) {
    if (to === "confirmed") {
      setError(null);
      setOutcome(null);
      setConfirming(true);
      return;
    }
    // Cancelling frees the time for someone else; make it a deliberate choice.
    if (to === "cancelled" && !window.confirm(`Cancel the booking for ${who}?`)) return;
    setError(null);
    setOutcome(null);
    startTransition(async () => {
      const result = await setBookingStatus(id, to);
      if (!result.ok) setError(result.error);
    });
  }

  function notYet() {
    setConfirming(false);
    setError(null);
    confirmButtonRef.current?.focus();
  }

  function submitConfirm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmBooking(id, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      setNote("");
      setOutcome(
        result.emailed
          ? { kind: "emailed", text: `Confirmed. ${clientFirstName} has been emailed.` }
          : {
              kind: "not-emailed",
              text: `Confirmed, but the email to ${clientFirstName} didn't send. Please call or email them yourself.`,
            },
      );
    });
  }

  return (
    <div className="stack">
      <div className="button-row">
        {ACTIONS[status].map((action) => (
          <button
            key={action.to}
            ref={action.to === "confirmed" ? confirmButtonRef : undefined}
            type="button"
            className={action.className}
            disabled={pending}
            aria-expanded={action.to === "confirmed" ? confirming : undefined}
            onClick={() => change(action.to)}
          >
            {action.label}
            <span className="visually-hidden"> the booking for {who}</span>
          </button>
        ))}
      </div>

      {confirming ? (
        <form className="confirm-panel stack" aria-labelledby={questionId} onSubmit={submitConfirm}>
          <div>
            <p id={questionId} ref={questionRef} tabIndex={-1} className="confirm-panel-question">
              {`Confirm ${clientFirstName}'s booking on ${when}?`}
            </p>
            <p className="confirm-panel-lead">{"They'll get a confirmation email."}</p>
          </div>
          <div className="field">
            <label htmlFor={noteId}>Note for {clientFirstName} (optional)</label>
            <p id={noteHintId} className="field-hint">
              {`Goes in the email only, and is not saved. For example, where to meet. Up to ${CONFIRM_NOTE_MAX} characters.`}
            </p>
            <textarea
              id={noteId}
              rows={3}
              maxLength={CONFIRM_NOTE_MAX}
              aria-describedby={noteHintId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="button-row">
            <button type="submit" className="button button--accent" disabled={pending}>
              Yes, confirm and email {clientFirstName}
            </button>
            <button type="button" className="button button-secondary" disabled={pending} onClick={notYet}>
              Not yet
            </button>
          </div>
        </form>
      ) : null}

      {outcome ? (
        <p
          ref={outcomeRef}
          tabIndex={-1}
          role={outcome.kind === "emailed" ? "status" : "alert"}
          className={outcome.kind === "emailed" ? "notice-message" : "warning-message"}
        >
          {outcome.text}
        </p>
      ) : null}

      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
