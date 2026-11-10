"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { cancelBooking, confirmBooking, resendConfirmation, setBookingStatus } from "./actions";
import { NO_EMAIL } from "./copy";
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

/**
 * Confirming, cancelling and resending the confirmation email the client, so
 * each asks first in a panel. Confirming and cancelling also offer "Don't
 * email the client" (unticked by default); resending is only an email.
 */
type PanelKind = "confirmed" | "cancelled" | "resend";

/** What happened after confirming, cancelling or resending, shown under the buttons. */
type Outcome = { kind: "done" | "not-emailed"; text: string };

/** What submitting a panel did: an error to show in it, or the outcome to announce. */
type PanelResult = { ok: false; error: string } | { ok: true; outcome: Outcome };

/** What each panel says and does. `name` is the client's first name; `when` the day and time. */
type Panel = {
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
  /** Whether it offers "Don't email the client". */
  skippable: boolean;
  run: (id: string, text: string, skipped: boolean, name: string) => Promise<PanelResult>;
};

/** Confirm or cancel (`send`), then say whether the client was emailed. `done` is e.g. "Confirmed". */
function changeStatus(send: typeof confirmBooking, done: string): Panel["run"] {
  return async (id, text, skipped, name) => {
    const result = await send(id, text, skipped);
    if (!result.ok) return result;
    return {
      ok: true,
      outcome:
        result.emailed === null
          ? { kind: "done", text: `${done}. ${skipped ? `${name} has not been emailed.` : NO_EMAIL}` }
          : result.emailed
          ? { kind: "done", text: `${done}. ${name} has been emailed.` }
          : { kind: "not-emailed", text: `${done}, but the email to ${name} didn't send. Please call or email them yourself.` },
    };
  };
}

const NOTE_HINT = `Goes in the email only, and is not saved. For example, where to meet. Up to ${CONFIRM_NOTE_MAX} characters.`;

const PANELS: Record<PanelKind, Panel> = {
  confirmed: {
    question: (name, when) => `Confirm ${name}'s booking on ${when}?`,
    lead: "They'll get a confirmation email.",
    fieldLabel: (name) => `Note for ${name} (optional)`,
    fieldHint: NOTE_HINT,
    max: CONFIRM_NOTE_MAX,
    submitLabel: (name) => `Yes, confirm and email ${name}`,
    noEmailSubmitLabel: "Yes, confirm",
    submitClassName: "button button--accent",
    backLabel: "Not yet",
    skippable: true,
    run: changeStatus(confirmBooking, "Confirmed"),
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
    skippable: true,
    run: changeStatus(cancelBooking, "Cancelled"),
  },
  resend: {
    question: (name, when) => `Resend ${name}'s confirmation for ${when}?`,
    lead: "They'll get the confirmation email again. Any note you sent before wasn't saved, so add anything they still need, like a video link.",
    fieldLabel: (name) => `Note for ${name} (optional)`,
    fieldHint: NOTE_HINT,
    max: CONFIRM_NOTE_MAX,
    submitLabel: (name) => `Yes, resend to ${name}`,
    // Only offered for a booking with an email, so never shown.
    noEmailSubmitLabel: "Yes, resend",
    submitClassName: "button button--accent",
    backLabel: "Not now",
    skippable: false,
    run: async (id, text) => {
      const result = await resendConfirmation(id, text);
      if (!result.ok) return result;
      return { ok: true, outcome: { kind: "done", text: `Confirmation sent again to ${result.sentTo}.` } };
    },
  },
};

export function BookingStatusButtons({
  id,
  status,
  who,
  clientFirstName,
  when,
  hasEmail = true,
  canResend = false,
}: {
  id: string;
  status: Status;
  /** e.g. "Jordan Tester on Friday, October 23", for button labels. */
  who: string;
  /** e.g. "Jordan", for the panels. */
  clientFirstName: string;
  /** e.g. "Friday, October 23 at 9:00 AM", for the panels. */
  when: string;
  /** False for an admin booking with no email: nobody is emailed, so the panels say so and ask for no note. */
  hasEmail?: boolean;
  /** True for a confirmed booking that hasn't started and has an email: offers "Resend confirmation". */
  canResend?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PanelKind | null>(null);
  const [text, setText] = useState("");
  const [skipEmail, setSkipEmail] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const questionId = useId();
  const fieldId = useId();
  const checkboxId = useId();
  const hintId = useId();
  const questionRef = useRef<HTMLParagraphElement>(null);
  const buttonRefs = useRef<Partial<Record<Status | PanelKind, HTMLButtonElement | null>>>({});
  const outcomeRef = useRef<HTMLParagraphElement>(null);

  // Move focus into the panel when it opens, so a keyboard or screen reader user lands on the question.
  useEffect(() => {
    if (open) questionRef.current?.focus();
  }, [open]);

  // Afterwards the panel and its button are gone: focus the result instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  function openPanel(kind: PanelKind) {
    setError(null);
    setOutcome(null);
    if (open !== kind) {
      setText("");
      setSkipEmail(false);
    }
    setOpen(kind);
  }

  function change(to: Status) {
    if (to in PANELS) {
      openPanel(to as PanelKind);
      return;
    }
    setError(null);
    setOutcome(null);
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
    const skipped = panel.skippable && hasEmail && skipEmail;
    setError(null);
    startTransition(async () => {
      const result = await panel.run(id, skipped ? "" : text, skipped, clientFirstName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(null);
      setText("");
      setSkipEmail(false);
      setOutcome(result.outcome);
    });
  }

  const panel = open ? PANELS[open] : null;
  /** Whether submitting this panel will email the client. */
  const emailing = hasEmail && !skipEmail;

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
        {status === "confirmed" && canResend ? (
          <button
            ref={(el) => {
              buttonRefs.current.resend = el;
            }}
            type="button"
            className="button button-secondary"
            disabled={pending}
            aria-expanded={open === "resend"}
            onClick={() => openPanel("resend")}
          >
            Resend confirmation
            <span className="visually-hidden"> for {who}</span>
          </button>
        ) : null}
      </div>

      {panel ? (
        <form key={open} className="confirm-panel stack" aria-labelledby={questionId} onSubmit={submit}>
          <div>
            <p id={questionId} ref={questionRef} tabIndex={-1} className="confirm-panel-question">
              {panel.question(clientFirstName, when)}
            </p>
            <p className="confirm-panel-lead">
              {!hasEmail ? NO_EMAIL : emailing ? panel.lead : `${clientFirstName} won't be emailed.`}
            </p>
          </div>
          {hasEmail && panel.skippable ? (
            <div className="check-field">
              <input
                id={checkboxId}
                type="checkbox"
                checked={skipEmail}
                onChange={(e) => setSkipEmail(e.target.checked)}
              />
              <label htmlFor={checkboxId}>Don&apos;t email the client</label>
            </div>
          ) : null}
          {emailing ? (
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
              {emailing ? panel.submitLabel(clientFirstName) : panel.noEmailSubmitLabel}
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
