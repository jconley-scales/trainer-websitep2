"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { gymTimeToUtc, utcToGymTime } from "@/lib/booking-availability";
import { firstName, formatDayMonthTime } from "@/lib/format";
import { editBooking } from "./actions";
import { BookingFields, type BookingFormFields } from "./booking-fields";
import { NO_EMAIL } from "./copy";

/** What the edit form needs to know about a booking (as /admin loads it). */
export type EditableBookingData = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  starts_at: string;
  ends_at: string;
  status: "new" | "confirmed" | "cancelled";
  source: "website" | "admin";
};

/** Which booking card is in edit mode: only one at a time. */
const Editing = createContext<{ editingId: string | null; setEditingId: (id: string | null) => void }>({
  editingId: null,
  setEditingId: () => {},
});

/** Wraps the booking cards, so opening one for editing closes any other. */
export function EditingProvider({ children }: { children: ReactNode }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return <Editing.Provider value={{ editingId, setEditingId }}>{children}</Editing.Provider>;
}

const minutesOf = (b: EditableBookingData) => Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60_000);

/** The booking as the form shows it, in the gym's time zone. */
function fieldsFrom(b: EditableBookingData): BookingFormFields {
  const { date, time } = utcToGymTime(b.starts_at);
  return {
    name: b.name,
    email: b.email ?? "",
    phone: b.phone ?? "",
    note: b.note ?? "",
    date,
    time,
    minutes: minutesOf(b),
  };
}

/** What happened after saving, shown on the card. */
type Outcome = { kind: "saved" | "not-emailed"; text: string };

/**
 * A booking card's body with an "Edit" button that turns the card into the
 * booking form, filled in. Saving changes only the details emails nobody;
 * a new time emails the client (moved, or Confirmed for a new request, which
 * moving also confirms) unless the trainer ticks "Don't email the client".
 * An overlap warns, and the trainer may save anyway, as when adding a booking.
 */
export function EditableBooking({
  booking,
  canEdit = true,
  details,
  actions,
}: {
  booking: EditableBookingData;
  /** False for cancelled and past bookings, which stay read-only. */
  canEdit?: boolean;
  /** The card's details, shown when not editing. */
  details: ReactNode;
  /** The card's Confirm/Cancel buttons, shown when not editing. */
  actions: ReactNode;
}) {
  const { editingId, setEditingId } = useContext(Editing);
  const editing = canEdit && editingId === booking.id;
  const [fields, setFields] = useState<BookingFormFields>(() => fieldsFrom(booking));
  const [skipEmail, setSkipEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();

  const id = useId();
  const headingId = `${id}-heading`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const returnFocus = useRef(false);

  // Move focus into the form when it opens, and back to Edit after "Never mind".
  useEffect(() => {
    if (editing) {
      headingRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  // After saving the form is gone: focus the result instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  const who = firstName(booking.name);
  const start = gymTimeToUtc(fields.date, fields.time);
  const moved =
    start !== null && (start.getTime() !== Date.parse(booking.starts_at) || fields.minutes !== minutesOf(booking));
  const hasEmail = fields.email.trim() !== "";
  const confirms = booking.status === "new";

  function set<K extends keyof BookingFormFields>(key: K, value: BookingFormFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    // A changed booking may no longer overlap, so the old warning no longer applies.
    setOverlap(null);
    setError(null);
  }

  function open() {
    setFields(fieldsFrom(booking));
    setSkipEmail(false);
    setError(null);
    setOverlap(null);
    setOutcome(null);
    setEditingId(booking.id);
  }

  function close() {
    returnFocus.current = true;
    setEditingId(null);
  }

  function save(allowOverlap: boolean) {
    setError(null);
    const input = { ...fields, id: booking.id, skipEmail };
    startTransition(async () => {
      const result = await editBooking(allowOverlap ? { ...input, allowOverlap: true } : input);
      if (!result.ok) {
        if (result.overlap) {
          setOverlap(result.error);
        } else {
          setOverlap(null);
          setError(result.error);
        }
        return;
      }
      setEditingId(null);
      setOverlap(null);
      if (!result.moved) {
        setOutcome({ kind: "saved", text: `Saved your changes to ${who}'s booking.` });
        return;
      }
      const when = start ? formatDayMonthTime(start.toISOString()) : "";
      const done = result.confirmed
        ? `Moved and confirmed ${who}'s session for ${when}`
        : `Moved ${who}'s session to ${when}`;
      if (result.emailed === false) {
        setOutcome({
          kind: "not-emailed",
          text: `${done}, but the email to ${who} didn't send. Please call or email them yourself.`,
        });
        return;
      }
      const emailed = result.emailed
        ? `${who} has been emailed ${result.confirmed ? "a confirmation" : "the new time"}.`
        : hasEmail
          ? `${who} has not been emailed.`
          : NO_EMAIL;
      setOutcome({ kind: "saved", text: `${done}. ${emailed}` });
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    save(false);
  }

  const outcomeMessage = outcome ? (
    <p
      ref={outcomeRef}
      tabIndex={-1}
      role={outcome.kind === "saved" ? "status" : "alert"}
      className={outcome.kind === "saved" ? "notice-message" : "warning-message"}
    >
      {outcome.text}
    </p>
  ) : null;

  if (!editing) {
    return (
      <>
        {details}
        <div className="stack">
          {canEdit ? (
            <div className="button-row">
              <button ref={editRef} type="button" className="button button-secondary" onClick={open}>
                Edit<span className="visually-hidden"> the booking for {booking.name}</span>
              </button>
            </div>
          ) : null}
          {actions}
          {outcomeMessage}
        </div>
      </>
    );
  }

  const checkboxId = `${id}-skip-email`;

  return (
    <form className="confirm-panel stack" aria-labelledby={headingId} onSubmit={submit} noValidate>
      <h4 id={headingId} ref={headingRef} tabIndex={-1} className="confirm-panel-question">
        Edit {who}&apos;s booking
      </h4>

      <BookingFields
        idPrefix={id}
        fields={fields}
        set={set}
        emailRequired={booking.source === "website"}
      />

      {moved ? (
        <div className="edit-booking-email stack">
          <p className="confirm-panel-lead">
            {confirms ? "Moving this request also confirms it. " : ""}
            {!hasEmail
              ? NO_EMAIL
              : confirms
                ? `Saving sends ${who} the confirmation email with the new time.`
                : `Saving emails ${who} the old and new times.`}
          </p>
          {hasEmail ? (
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
        </div>
      ) : null}

      {overlap ? (
        <p className="warning-message" role="alert">
          {overlap} You can choose another time, or save it anyway.
        </p>
      ) : null}

      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}

      <div className="button-row">
        {overlap ? (
          <button type="button" className="button button--accent" disabled={pending} onClick={() => save(true)}>
            Save anyway
          </button>
        ) : (
          <button type="submit" className="button button--accent" disabled={pending}>
            Save changes
          </button>
        )}
        <button type="button" className="button button-secondary" disabled={pending} onClick={close}>
          Never mind
        </button>
      </div>
    </form>
  );
}
