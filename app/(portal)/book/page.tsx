import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookNotice } from "@/components/BookNotice";
import { SlotRow, type SlotRowData } from "@/components/SlotRow";
import { listAvailableSlots } from "@/lib/booking";
import { formatDate, formatTime, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getTrainerNames } from "@/lib/trainers";
import { bookSlotAction } from "../actions";

export const metadata: Metadata = {
  title: "Book a session - Training Portal",
};

/** Plain-language messages for each reason a booking can be refused (see bookSlotAction). */
const BOOK_ERRORS: Record<string, string> = {
  taken: "Sorry, that time was just taken. Please choose another.",
  past: "Sorry, that time has already started. Please choose another.",
  "already-booked": "You have already booked that time. You can see it in your sessions.",
  "not-found": "Sorry, we could not find that time. Please choose another.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * The heading and the way back never depend on who is signed in, so they are part
 * of the static shell. The open times (and any message about a refused booking)
 * are request-time work and stream in behind a Suspense boundary.
 */
export default function BookPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1>Book a session</h1>
      <p>
        <Link className="button button-secondary" href="/sessions">
          Back to your sessions
        </Link>
      </p>
      <Suspense fallback={<p role="status">Loading available times...</p>}>
        <OpenSlots searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Day = { dateLabel: string; slots: SlotRowData[] };

async function OpenSlots({ searchParams }: { searchParams: SearchParams }) {
  // Request-time work (session cookie, current time): opt in explicitly, as the
  // sessions screen does.
  await connection();
  const { error } = await searchParams;
  // The authenticated client: row level security applies to everything below.
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const [slots, trainerNames] = await Promise.all([
    listAvailableSlots(db, new Date()),
    getTrainerNames(db),
  ]);

  // Slots arrive soonest first, so each day's slots are already together.
  const days: Day[] = [];
  for (const s of slots) {
    const dateLabel = formatDate(s.starts_at);
    let day = days.at(-1);
    if (!day || day.dateLabel !== dateLabel) {
      day = { dateLabel, slots: [] };
      days.push(day);
    }
    day.slots.push({
      id: s.id,
      dateLabel,
      timeLabel: formatTimeRange(s.starts_at, s.ends_at),
      startLabel: formatTime(s.starts_at),
      trainerName: trainerNames.get(s.trainer_id) ?? "your trainer",
      location: s.location ?? "Location to be announced",
    });
  }

  const message = typeof error === "string" ? BOOK_ERRORS[error] : undefined;

  return (
    <>
      {message ? <BookNotice message={message} /> : null}
      {days.length === 0 ? (
        <p className="empty-state">
          There are no open times right now. Please check back soon, or contact
          your trainer.
        </p>
      ) : (
        days.map((day, i) => (
          <section key={day.dateLabel} aria-labelledby={`day-${i}`} className="day-group">
            <h2 id={`day-${i}`} className="day-heading">
              {day.dateLabel}
            </h2>
            <ul className="slot-list" role="list">
              {day.slots.map((slot) => (
                <SlotRow key={slot.id} slot={slot} bookAction={bookSlotAction} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
