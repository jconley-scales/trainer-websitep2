"use client";

import { useEffect, useId, useState } from "react";
import { submitBooking } from "@/app/(marketing)/book/actions";
import { availableDays, type AvailableDay, type AvailableSlot } from "@/lib/booking-availability";
import { formatDate, formatTimeRange } from "@/lib/format";
import { SITE, type ServiceId } from "@/lib/site";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Step = "idle" | "submitting" | "success" | "error";

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

export function BookingCalendar() {
  // Availability is computed on the client (current time), so the page itself
  // stays static. The server action re-validates the chosen slot on submit.
  const [days, setDays] = useState<AvailableDay[] | null>(null);
  const [monthIndex, setMonthIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  // One-to-one is what every slot offered before services could be chosen.
  const [serviceId, setServiceId] = useState<ServiceId>(SITE.services[0].id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");

  const headingId = useId();
  const slotsHeadingId = useId();
  const formHeadingId = useId();

  useEffect(() => {
    setDays(availableDays(new Date()));
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

  const service = SITE.services.find((s) => s.id === serviceId) ?? SITE.services[0];

  if (step === "success" && selectedSlot) {
    return (
      <div className="booking-success" role="status">
        <h2 className="section-title">Thank you — your request is in</h2>
        <p>
          You asked to book <strong>{service.title}</strong> on{" "}
          <strong>{formatDate(selectedSlot.startsAt)}</strong>,{" "}
          <strong>{formatTimeRange(selectedSlot.startsAt, selectedSlot.endsAt)}</strong>.
        </p>
        <p>
          This is a request, not a confirmed booking yet — we will email or call you to confirm. If you
          need to change anything, just <a href="/contact">get in touch</a>.
        </p>
      </div>
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
    const result = await submitBooking({
      name,
      email,
      phone,
      note,
      service: service.id,
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
    });
    if (result.ok) {
      setStep("success");
    } else {
      setStep("error");
      setError(result.error);
    }
  }

  return (
    <div className="booking">
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

      {/* Step 2: pick a service and a time */}
      {selectedDate && daySlots.length > 0 ? (
        <div className="booking-times" aria-labelledby={slotsHeadingId}>
          <h2 id={slotsHeadingId} className="section-title">
            Times on {formatDate(daySlots[0].startsAt)}
          </h2>
          <fieldset className="service-options">
            <legend>Which service would you like?</legend>
            {SITE.services.map((option) => (
              <label key={option.id} className="service-option">
                <input
                  type="radio"
                  name="service"
                  value={option.id}
                  checked={serviceId === option.id}
                  onChange={() => {
                    setServiceId(option.id);
                    if (step === "error") setStep("idle");
                  }}
                />
                <span className="service-option-text">
                  <span className="service-option-title">{option.title}</span>
                  <span className="service-option-price">{option.price}</span>
                </span>
              </label>
            ))}
          </fieldset>
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
                  }}
                >
                  <span className="slot-time">{formatTimeRange(slot.startsAt, slot.endsAt)}</span>
                  <span className="slot-detail">60 minutes · {service.title}</span>
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
            Booking <strong>{service.title}</strong> on{" "}
            <strong>{formatDate(selectedSlot.startsAt)}</strong>,{" "}
            <strong>{formatTimeRange(selectedSlot.startsAt, selectedSlot.endsAt)}</strong>.
          </p>

          {step === "error" ? (
            <p className="error-message" role="alert">
              {error}
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
              <textarea
                id="booking-note"
                name="note"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
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
