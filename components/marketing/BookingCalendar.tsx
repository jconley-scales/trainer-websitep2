"use client";

import { useEffect, useId, useState } from "react";
import { PrivacyNote } from "@/components/marketing/PrivacyNote";
import { getTakenTimes, submitBooking } from "@/app/(marketing)/book/actions";
import {
  availableDays,
  withoutTaken,
  type AvailableDay,
  type AvailableSlot,
  type TakenTime,
} from "@/lib/booking-availability";
import { formatDate, formatTimeRange } from "@/lib/format";
import { SITE } from "@/lib/site";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Step = "idle" | "submitting" | "error";

function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

/** The weeks of a month (Sun–Sat) as day-numbers; 0 is a blank padding cell. */
function monthGrid(year: number, month: number): number[][] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: number[] = Array.from({ length: firstWeekday }, () => 0);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(0);
  const weeks: number[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Offered times minus any a booking overlaps, including `alsoTaken` (this
 *  visit's own requests, in case the lookup is behind or fails). If the lookup
 *  fails, offer the rest: the database still refuses a time that is taken. */
async function loadAvailableDays(alsoTaken: readonly AvailableSlot[]): Promise<AvailableDay[]> {
  const taken = await getTakenTimes().catch(() => [] as TakenTime[]);
  const own = alsoTaken.map((slot) => ({ start: Date.parse(slot.startsAt), end: Date.parse(slot.endsAt) }));
  return withoutTaken(availableDays(new Date()), [...taken, ...own]);
}

/** The contact details a visitor gives, kept (in memory only) so they can book
 *  again in the same visit without typing them out a second time. */
export type ContactDetails = { name: string; email: string; phone: string };

/** `onBooked` gets the requested time and the details used once the request
 *  has gone through; the page then replaces itself with the thank-you.
 *  `initialDetails` pre-fills the form when booking again in the same visit,
 *  and `alsoTaken` (the times already requested this visit) are not offered. */
export function BookingCalendar({
  onBooked,
  initialDetails,
  alsoTaken = [],
}: {
  onBooked: (slot: AvailableSlot, details: ContactDetails) => void;
  initialDetails?: ContactDetails;
  alsoTaken?: readonly AvailableSlot[];
}) {
  // Availability is computed on the client (current time), so the page itself
  // stays static. The server action re-validates the chosen slot on submit.
  const [days, setDays] = useState<AvailableDay[] | null>(null);
  const [monthIndex, setMonthIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [name, setName] = useState(initialDetails?.name ?? "");
  const [email, setEmail] = useState(initialDetails?.email ?? "");
  const [phone, setPhone] = useState(initialDetails?.phone ?? "");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  // Shown above the calendar when the chosen time was taken in the meantime.
  const [takenNotice, setTakenNotice] = useState("");

  const headingId = useId();
  const slotsHeadingId = useId();
  const formHeadingId = useId();

  useEffect(() => {
    let cancelled = false;
    loadAvailableDays(alsoTaken).then((fresh) => {
      if (!cancelled) setDays(fresh);
    });
    return () => {
      cancelled = true;
    };
    // Loaded once per showing of the calendar; the page remounts it to book again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same markup on the server and the first client paint, so no hydration clash.
  if (days === null) {
    return <p className="booking-hint">Loading available times…</p>;
  }

  if (days.length === 0) {
    return (
      <p className="booking-empty">
        There are no open times just now. Please check back soon, or{" "}
        <a href="/contact">get in touch</a> and we will find a time together.
      </p>
    );
  }

  const slotsByDate = new Map(days.map((day) => [day.date, day.slots]));
  const months = [...new Set(days.map((day) => monthKey(day.date)))]; // already sorted
  const safeMonthIndex = Math.min(monthIndex, months.length - 1);
  const [yStr, mStr] = months[safeMonthIndex].split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const weeks = monthGrid(year, month);
  const daySlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : [];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return;
    setStep("submitting");
    setError("");
    setLimitReached(false);
    const result = await submitBooking({
      name,
      email,
      phone,
      note,
      website,
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
    });
    if (result.ok) {
      onBooked(selectedSlot, { name, email, phone });
    } else if (result.taken) {
      // Someone else got there first: show the up-to-date times and say so.
      const fresh = await loadAvailableDays(alsoTaken);
      setDays(fresh);
      setSelectedSlot(null);
      if (!fresh.some((day) => day.date === selectedDate)) setSelectedDate(null);
      setStep("idle");
      setTakenNotice(result.error);
    } else {
      setStep("error");
      setError(result.error);
      setLimitReached(Boolean(result.limitReached));
    }
  }

  return (
    <div className="booking">
      {takenNotice ? (
        <p className="error-message" role="alert">
          {takenNotice}
        </p>
      ) : null}

      {/* Step 1: pick a day */}
      <div className="booking-calendar">
        <div className="booking-month-bar">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setMonthIndex(safeMonthIndex - 1)}
            disabled={safeMonthIndex === 0}
          >
            <span aria-hidden="true">&larr;</span>
            <span className="visually-hidden">Previous month</span>
          </button>
          <h2 id={headingId} className="booking-month-title">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setMonthIndex(safeMonthIndex + 1)}
            disabled={safeMonthIndex >= months.length - 1}
          >
            <span aria-hidden="true">&rarr;</span>
            <span className="visually-hidden">Next month</span>
          </button>
        </div>

        <table className="booking-grid" aria-labelledby={headingId}>
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((label) => (
                <th key={label} scope="col" abbr={label}>
                  <span aria-hidden="true">{label.slice(0, 1)}</span>
                  <span className="visually-hidden">{label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  if (day === 0) return <td key={di} className="booking-cell booking-cell--empty" />;
                  const date = `${months[safeMonthIndex]}-${String(day).padStart(2, "0")}`;
                  const slots = slotsByDate.get(date);
                  if (!slots) {
                    return (
                      <td key={di} className="booking-cell">
                        <span className="booking-day booking-day--off">{day}</span>
                      </td>
                    );
                  }
                  const label = `${formatDate(slots[0].startsAt)} — ${slots.length} ${
                    slots.length === 1 ? "time" : "times"
                  } available`;
                  return (
                    <td key={di} className="booking-cell">
                      <button
                        type="button"
                        className={`booking-day booking-day--open${
                          selectedDate === date ? " is-selected" : ""
                        }`}
                        aria-pressed={selectedDate === date}
                        aria-label={label}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedSlot(null);
                          setStep("idle");
                        }}
                      >
                        {day}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="booking-hint">Days with an open session are shown in colour. Pick one to see its times.</p>
      </div>

      {/* Step 2: pick a time */}
      {selectedDate && daySlots.length > 0 ? (
        <div className="booking-times" aria-labelledby={slotsHeadingId}>
          <h2 id={slotsHeadingId} className="section-title">
            Times on {formatDate(daySlots[0].startsAt)}
          </h2>
          <ul className="slot-list">
            {daySlots.map((slot) => (
              <li key={slot.id}>
                <button
                  type="button"
                  className={`slot-row${selectedSlot?.id === slot.id ? " is-selected" : ""}`}
                  aria-pressed={selectedSlot?.id === slot.id}
                  onClick={() => {
                    setSelectedSlot(slot);
                    setStep("idle");
                    setTakenNotice("");
                  }}
                >
                  <span className="slot-time">{formatTimeRange(slot.startsAt, slot.endsAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Step 3: your details */}
      {selectedSlot ? (
        <form className="booking-form" onSubmit={handleSubmit} aria-labelledby={formHeadingId}>
          <h2 id={formHeadingId} className="section-title">
            Your details
          </h2>
          <p className="booking-chosen">
            Booking <strong>{formatDate(selectedSlot.startsAt)}</strong>,{" "}
            <strong>{formatTimeRange(selectedSlot.startsAt, selectedSlot.endsAt)}</strong>.
          </p>
          <PrivacyNote />

          {step === "error" ? (
            <p className="error-message" role="alert">
              {error}
              {limitReached ? (
                <>
                  {" "}
                  <a href="/contact">Send {SITE.trainerFirstName} a message</a>
                </>
              ) : null}
            </p>
          ) : null}

          <div className="stack">
            <div className="field">
              <label htmlFor="booking-name">Your name</label>
              <input
                id="booking-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="booking-email">Your email address</label>
              <input
                id="booking-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="booking-phone">Your phone number (optional)</label>
              <input
                id="booking-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="booking-note">Anything you would like me to know (optional)</label>
              <p id="booking-note-hint" className="field-hint">
                {SITE.bookingNoteHint}
              </p>
              <textarea
                id="booking-note"
                name="note"
                aria-describedby="booking-note-hint"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {/* Bot trap: off-screen and out of the tab order. */}
            <div className="visually-hidden" aria-hidden="true">
              <label htmlFor="booking-website">Leave this empty</label>
              <input
                id="booking-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <button type="submit" className="button button--accent button--lg" disabled={step === "submitting"}>
              {step === "submitting" ? "Sending…" : "Request this session"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
