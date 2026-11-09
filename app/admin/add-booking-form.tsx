"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { gymTimeToUtc } from "@/lib/booking-availability";
import { firstName, formatDayMonthTime } from "@/lib/format";
import { addBooking } from "./actions";
import { BookingFields, type BookingFormFields } from "./booking-fields";
import { BOOKING_DEFAULT_MINUTES } from "./limits";

const EMPTY: BookingFormFields = {
  name: "",
  email: "",
  phone: "",
  note: "",
  date: "",
  time: "",
  minutes: BOOKING_DEFAULT_MINUTES,
};

/** What happened after saving, shown under the button. */
type Outcome = { kind: "saved" | "not-emailed"; text: string };

/**
 * "Add a booking" at the top of /admin: for a session the trainer arranged
 * with a client by phone or text. Opens a form inline; any future date and
 * quarter-hour time, only the name required. If the time overlaps another
 * booking the server says so, and the trainer can save anyway.
 */
export function AddBookingForm() {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<BookingFormFields>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();

  const id = useId();
  const headingId = `${id}-heading`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);

  // Move focus into the form when it opens, so a keyboard or screen reader user lands on it.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  // Afterwards the form is gone: focus the result instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  function set<K extends keyof BookingFormFields>(key: K, value: BookingFormFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    // A changed booking may no longer overlap, so the old warning no longer applies.
    setOverlap(null);
    setError(null);
  }

  function toggle() {
    setOutcome(null);
    setError(null);
    setOverlap(null);
    if (open) {
      setOpen(false);
      return;
    }
    setFields(EMPTY);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setError(null);
    setOverlap(null);
    toggleRef.current?.focus();
  }

  function save(allowOverlap: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await addBooking(allowOverlap ? { ...fields, allowOverlap: true } : fields);
      if (!result.ok) {
        if (result.overlap) {
          setOverlap(result.error);
        } else {
          setOverlap(null);
          setError(result.error);
        }
        return;
      }
      const who = firstName(fields.name);
      const start = gymTimeToUtc(fields.date, fields.time);
      const added = `Added ${who}'s session${start ? ` on ${formatDayMonthTime(start.toISOString())}` : ""}`;
      setOpen(false);
      setOverlap(null);
      setFields(EMPTY);
      setOutcome(
        result.emailed === false
          ? {
              kind: "not-emailed",
              text: `${added}, but the confirmation email to ${who} didn't send. Please call or email them yourself.`,
            }
          : {
              kind: "saved",
              text: result.emailed ? `${added}. ${who} has been emailed a confirmation.` : `${added}.`,
            },
      );
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    save(false);
  }

  return (
    <div className="stack add-booking">
      <div>
        <button
          ref={toggleRef}
          type="button"
          className="button button--accent"
          aria-expanded={open}
          onClick={toggle}
        >
          Add a booking
        </button>
      </div>

      {open ? (
        <form className="confirm-panel stack" aria-labelledby={headingId} onSubmit={submit} noValidate>
          <div>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="confirm-panel-question">
              Add a booking
            </h2>
            <p className="confirm-panel-lead">
              For a session you arranged by phone or message. It is saved as confirmed.
            </p>
          </div>

          <BookingFields
            idPrefix={id}
            fields={fields}
            set={set}
            emailRequired={false}
            emailHint="If you add one, they'll get a confirmation email."
          />

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
                Save booking
              </button>
            )}
            <button type="button" className="button button-secondary" disabled={pending} onClick={close}>
              Close
            </button>
          </div>
        </form>
      ) : null}

      {outcome ? (
        <p
          ref={outcomeRef}
          tabIndex={-1}
          role={outcome.kind === "saved" ? "status" : "alert"}
          className={outcome.kind === "saved" ? "notice-message" : "warning-message"}
        >
          {outcome.text}
        </p>
      ) : null}
    </div>
  );
}
