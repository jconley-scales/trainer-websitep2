"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { cancelBooking, confirmBooking, setBookingStatus } from "./actions";
import { CANCEL_REASON_MAX, CONFIRM_NOTE_MAX } from "./limits";

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

/** Confirming and cancelling both email the client, so each asks first in a panel. */
type PanelKind = "confirmed" | "cancelled";

/** What each panel says and does. `name` is the client's first name; `when` the day and time. */
const PANELS: Record<
  PanelKind,
  {
    question: (name: string, when: string) => string;
    lead: string;
    fieldLabel: (name: string) => string;
    fieldHint?: string;
    max: number;
    submitLabel: (name: string) => string;
    /** The submit button when nobody will be emailed. */
    noEmailSubmitLabel: string;
    submitClassName: string;
    backLabel: string;
    done: string;
    send: typeof confirmBooking;
  }
> = {
  confirmed: {
    question: (name, when) => `Confirm ${name}'s booking on ${when}?`,
    lead: "They'll get a confirmation email.",
    fieldLabel: (name) => `Note for ${name} (optional)`,
    fieldHint: `Goes in the email only, and is not saved. For example, where to meet. Up to ${CONFIRM_NOTE_MAX} characters.`,
    max: CONFIRM_NOTE_MAX,
    submitLabel: (name) => `Yes, confirm and email ${name}`,
    noEmailSubmitLabel: "Yes, confirm",
    submitClassName: "button button--accent",
    backLabel: "Not yet",
    done: "Confirmed",
    send: confirmBooking,
  },
  cancelled: {
    question: (name, when) => `Cancel ${name}'s booking on ${when}?`,
    lead: "They'll get an email letting them know.",
    fieldLabel: () => "Reason (optional, included in the email)",
    fieldHint: `Not saved. Up to ${CANCEL_REASON_MAX} characters.`,
    max: CANCEL_REASON_MAX,
    submitLabel: (name) => `Yes, cancel and email ${name}`,
    noEmailSubmitLabel: "Yes, cancel",
    submitClassName: "button button-danger",
    backLabel: "Keep booking",
    done: "Cancelled",
    send: cancelBooking,
  },
};

/** What happened after confirming or cancelling, shown under the buttons. */
type Outcome = { kind: "done" | "not-emailed"; text: string };

export function BookingStatusButtons({
  id,
  status,
  who,
  clientFirstName,
  when,
  hasEmail = true,
}: {
  id: string;
  status: Status;
  /** e.g. "Jordan Tester on Friday, October 23", for button labels. */
  who: string;
  /** e.g. "Jordan", for the confirm and cancel panels. */
  clientFirstName: string;
  /** e.g. "Friday, October 23 at 9:00 AM", for the confirm and cancel panels. */
  when: string;
  /** False for an admin booking with no email: nobody is emailed, so the panels say so and ask for no note. */
  hasEmail?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PanelKind | null>(null);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const questionId = useId();
  const fieldId = useId();
  const hintId = useId();
  const questionRef = useRef<HTMLParagraphElement>(null);
  const buttonRefs = useRef<Partial<Record<Status, HTMLButtonElement | null>>>({});
  const outcomeRef = useRef<HTMLParagraphElement>(null);

  // Move focus into the panel when it opens, so a keyboard or screen reader user lands on the question.
  useEffect(() => {
    if (open) questionRef.current?.focus();
  }, [open]);

  // Afterwards the panel and its button are gone: focus the result instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  function change(to: Status) {
    setError(null);
    setOutcome(null);
    if (to in PANELS) {
      const kind = to as PanelKind;
      if (open !== kind) setText("");
      setOpen(kind);
      return;
    }
    // Reopening emails no one, so it acts straight away.
    startTransition(async () => {
      const result = await setBookingStatus(id, to);
      if (!result.ok) setError(result.error);
    });
  }

  function closePanel() {
    const was = open;
    setOpen(null);
    setError(null);
    if (was) buttonRefs.current[was]?.focus();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!open) return;
    const panel = PANELS[open];
    setError(null);
    startTransition(async () => {
      const result = await panel.send(id, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(null);
      setText("");
      setOutcome(
        result.emailed === null
          ? { kind: "done", text: `${panel.done}. ${noEmail}` }
          : result.emailed
          ? { kind: "done", text: `${panel.done}. ${clientFirstName} has been emailed.` }
          : {
              kind: "not-emailed",
              text: `${panel.done}, but the email to ${clientFirstName} didn't send. Please call or email them yourself.`,
            },
      );
    });
  }

  const panel = open ? PANELS[open] : null;
  const noEmail = `There's no email for ${clientFirstName}, so please let them know yourself.`;

  return (
    <div className="stack">
      <div className="button-row">
        {ACTIONS[status].map((action) => (
          <button
            key={action.to}
            ref={(el) => {
              buttonRefs.current[action.to] = el;
            }}
            type="button"
            className={action.className}
            disabled={pending}
            aria-expanded={action.to in PANELS ? open === action.to : undefined}
            onClick={() => change(action.to)}
          >
            {action.label}
            <span className="visually-hidden"> the booking for {who}</span>
          </button>
        ))}
      </div>

      {panel ? (
        <form key={open} className="confirm-panel stack" aria-labelledby={questionId} onSubmit={submit}>
          <div>
            <p id={questionId} ref={questionRef} tabIndex={-1} className="confirm-panel-question">
              {panel.question(clientFirstName, when)}
            </p>
            <p className="confirm-panel-lead">{hasEmail ? panel.lead : noEmail}</p>
          </div>
          {hasEmail ? (
            <div className="field">
              <label htmlFor={fieldId}>{panel.fieldLabel(clientFirstName)}</label>
              <p id={hintId} className="field-hint">
                {panel.fieldHint}
              </p>
              <textarea
                id={fieldId}
                rows={3}
                maxLength={panel.max}
                aria-describedby={hintId}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          ) : null}
          <div className="button-row">
            <button type="submit" className={panel.submitClassName} disabled={pending}>
              {hasEmail ? panel.submitLabel(clientFirstName) : panel.noEmailSubmitLabel}
            </button>
            <button type="button" className="button button-secondary" disabled={pending} onClick={closePanel}>
              {panel.backLabel}
            </button>
          </div>
        </form>
      ) : null}

      {outcome ? (
        <p
          ref={outcomeRef}
          tabIndex={-1}
          role={outcome.kind === "done" ? "status" : "alert"}
          className={outcome.kind === "done" ? "notice-message" : "warning-message"}
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
