"use client";

import { DISPLAY_TIME_ZONE } from "@/lib/format";
import type { AddBookingInput } from "./actions";
import {
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

/** What the booking form holds: everything addBooking and editBooking take but the overlap override. */
export type BookingFormFields = Omit<AddBookingInput, "allowOverlap">;

/**
 * The booking form's fields, shared by "Add a booking" and editing a booking:
 * name, date, start time (any quarter hour), length, email, phone and note.
 * The caller owns the values and the form around them.
 */
export function BookingFields({
  idPrefix,
  fields,
  set,
  emailRequired,
  emailHint,
}: {
  /** Unique per form, so labels match their inputs. */
  idPrefix: string;
  fields: BookingFormFields;
  set: <K extends keyof BookingFormFields>(key: K, value: BookingFormFields[K]) => void;
  /** True for a website booking, which must keep an email; the label then drops "(optional)". */
  emailRequired: boolean;
  emailHint?: string;
}) {
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
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
        <label htmlFor={fieldId("email")}>{emailRequired ? "Email" : "Email (optional)"}</label>
        {emailHint ? (
          <p id={fieldId("email-hint")} className="field-hint">
            {emailHint}
          </p>
        ) : null}
        <input
          id={fieldId("email")}
          type="email"
          autoComplete="off"
          maxLength={BOOKING_EMAIL_MAX}
          aria-required={emailRequired ? "true" : undefined}
          aria-describedby={emailHint ? fieldId("email-hint") : undefined}
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
    </>
  );
}
