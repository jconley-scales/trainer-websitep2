"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { gymTimeToUtc } from "@/lib/booking-availability";
import { DISPLAY_TIME_ZONE, firstName, formatDayMonthTime } from "@/lib/format";
import { addBooking, type AddBookingInput } from "./actions";
import {
  BOOKING_DEFAULT_MINUTES,
  BOOKING_EMAIL_MAX,
  BOOKING_LENGTHS,
  BOOKING_NAME_MAX,
  BOOKING_NOTE_MAX,
  BOOKING_PHONE_MAX,
  BOOKING_STEP_MINUTES,
} from "./limits";

/** Every quarter hour of the day, as "HH:MM" values with "10:15 AM" labels. */
const START_TIMES = Array.from({ length: (24 * 60) / BOOKING_STEP_MINUTES }, (_, i) => {
  const total = i * BOOKING_STEP_MINUTES;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const label = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { value, label };
});

/** "45 minutes", "1 hour", "1 hour 30 minutes", "2 hours". */
function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? "" : `${h} ${h === 1 ? "hour" : "hours"}`;
  const mins = m === 0 ? "" : `${m} minutes`;
  return [hours, mins].filter(Boolean).join(" ");
}

/** Today's date in the gym's zone, "YYYY-MM-DD", the earliest a booking can be on. */
const gymToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(new Date());

type Fields = Omit<AddBookingInput, "allowOverlap">;

const EMPTY: Fields = {
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
  const [fields, setFields] = useState<Fields>(EMPTY);
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

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
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

  const fieldId = (name: string) => `${id}-${name}`;

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

          <div className="field">
            <label htmlFor={fieldId("name")}>Client&apos;s name</label>
            <input
              id={fieldId("name")}
              type="text"
              autoComplete="off"
              maxLength={BOOKING_NAME_MAX}
              aria-required="true"
              value={fields.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="add-booking-when">
            <div className="field">
              <label htmlFor={fieldId("date")}>Date</label>
              <input
                id={fieldId("date")}
                type="date"
                min={gymToday()}
                aria-required="true"
                value={fields.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={fieldId("time")}>Start time</label>
              <select
                id={fieldId("time")}
                aria-required="true"
                value={fields.time}
                onChange={(e) => set("time", e.target.value)}
              >
                <option value="">Choose a time</option>
                {START_TIMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={fieldId("minutes")}>Length</label>
              <select
                id={fieldId("minutes")}
                value={String(fields.minutes)}
                onChange={(e) => set("minutes", Number(e.target.value))}
              >
                {BOOKING_LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    {lengthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor={fieldId("email")}>Email (optional)</label>
            <p id={fieldId("email-hint")} className="field-hint">
              If you add one, they&apos;ll get a confirmation email.
            </p>
            <input
              id={fieldId("email")}
              type="email"
              autoComplete="off"
              maxLength={BOOKING_EMAIL_MAX}
              aria-describedby={fieldId("email-hint")}
              value={fields.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor={fieldId("phone")}>Phone (optional)</label>
            <input
              id={fieldId("phone")}
              type="tel"
              autoComplete="off"
              maxLength={BOOKING_PHONE_MAX}
              value={fields.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor={fieldId("note")}>Note (optional)</label>
            <p id={fieldId("note-hint")} className="field-hint">
              Only you see this. It is not emailed.
            </p>
            <textarea
              id={fieldId("note")}
              rows={3}
              maxLength={BOOKING_NOTE_MAX}
              aria-describedby={fieldId("note-hint")}
              value={fields.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

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
