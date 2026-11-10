import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { firstName, formatDate, formatDayMonthTime, formatTimeRange } from "@/lib/format";
import { sessionTypeTag, toSessionType, type SessionType } from "@/lib/session-types";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { AddBookingForm } from "./add-booking-form";
import { BookingStatusButtons } from "./booking-status-buttons";
import { EditableBooking, EditingProvider } from "./edit-booking";

export const metadata: Metadata = { title: "Bookings" };

type Booking = {
  id: string;
  name: string;
  /** Null only for an admin booking, where email is optional. */
  email: string | null;
  phone: string | null;
  note: string | null;
  starts_at: string;
  ends_at: string;
  status: "new" | "confirmed" | "cancelled";
  created_at: string;
  /** "admin" when the trainer added it at /admin, "website" when requested on /book. */
  source: "website" | "admin";
  /** When its details or time were last edited at /admin; null if never. */
  updated_at: string | null;
  /** "one-on-one" or "partner"; null for bookings made before it was recorded. */
  session_type: SessionType | null;
};

const STATUS_LABEL: Record<Booking["status"], string> = {
  new: "New request",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

/**
 * The heading and sign-out button are the static shell. Reading the session
 * and the bookings is request-time work, so the list streams in behind a
 * Suspense boundary (required with cacheComponents).
 */
export default function AdminPage() {
  return (
    <>
      <div className="admin-heading-row">
        <h1>Bookings</h1>
        <form action={signOut}>
          <button type="submit" className="button-secondary">
            Sign out
          </button>
        </form>
      </div>
      <Suspense fallback={<p role="status">Loading bookings...</p>}>
        <BookingList />
      </Suspense>
    </>
  );
}

async function BookingList() {
  await connection();
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  // The database decides who is an admin; a non-admin simply reads nothing.
  const { data: isAdmin } = await db.rpc("is_admin");
  if (!isAdmin) {
    return (
      <p className="notice-message">
        The account <strong>{user.email}</strong> cannot manage bookings. Ask whoever runs the
        site to add it with <code>npm run admin:add</code>.
      </p>
    );
  }

  const bookings = await loadBookings(db);
  if (!bookings) {
    return (
      <p className="error-message" role="alert">
        The bookings could not be loaded just now. Please refresh the page.
      </p>
    );
  }

  const { upcoming, past, now } = bookings;
  const newCount = upcoming.filter((b) => b.status === "new").length;

  return (
    <>
      <AddBookingForm />

      <p className="admin-summary">
        {newCount === 0
          ? "No new requests waiting."
          : `${newCount} new ${newCount === 1 ? "request needs" : "requests need"} confirming.`}{" "}
        Times are shown in the gym&apos;s time zone.
      </p>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="empty-state">No upcoming bookings yet.</p>
        ) : (
          <EditingProvider>
            <BookingCards bookings={upcoming} now={now} />
          </EditingProvider>
        )}
      </section>

      {past.length > 0 ? (
        <details className="admin-past">
          <summary>Past bookings ({past.length})</summary>
          <BookingCards bookings={past} now={now} readOnly />
        </details>
      ) : null}
    </>
  );
}

/**
 * Every request the admin can see (row level security returns nothing to
 * anyone else), split into upcoming (soonest first) and past (latest first)
 * at the moment of the request. Returns null if the query fails.
 */
async function loadBookings(
  db: Awaited<ReturnType<typeof createClient>>,
): Promise<{ upcoming: Booking[]; past: Booking[]; now: number } | null> {
  const { data, error } = await db
    .from("booking_requests")
    .select("id, name, email, phone, note, starts_at, ends_at, status, created_at, source, updated_at, session_type")
    .order("starts_at", { ascending: true })
    .overrideTypes<Booking[], { merge: false }>();
  if (error) return null;
  const now = Date.now();
  // Narrowed once here, so a stray stored value can never reach the page as a tag.
  const bookings = data.map((b) => ({ ...b, session_type: toSessionType(b.session_type) }));
  return {
    upcoming: bookings.filter((b) => Date.parse(b.ends_at) >= now),
    past: bookings.filter((b) => Date.parse(b.ends_at) < now).reverse(),
    now,
  };
}

/**
 * The booking cards. Unless `readOnly`, each has Confirm/Cancel buttons, and a
 * live booking that has not started yet (as of `now`) can be edited or moved.
 */
function BookingCards({
  bookings,
  now,
  readOnly = false,
}: {
  bookings: Booking[];
  now: number;
  readOnly?: boolean;
}) {
  return (
    <ul className="session-list">
      {bookings.map((b) => {
        const date = formatDate(b.starts_at);
        const details = (
          <dl className="session-details">
            <div>
              <dt>Time</dt>
              <dd>{formatTimeRange(b.starts_at, b.ends_at)}</dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd>
                {b.name}
                {b.session_type ? (
                  <>
                    {" "}
                    <span className="source-tag session-type-tag">{sessionTypeTag(b.session_type)}</span>
                  </>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{b.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : "No email given"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{b.phone ? <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>{b.phone}</a> : "Not given"}</dd>
            </div>
            {b.note ? (
              <div>
                <dt>Note</dt>
                <dd className="admin-note">{b.note}</dd>
              </div>
            ) : null}
            <div>
              <dt>{b.source === "admin" ? "Added" : "Requested"}</dt>
              <dd>{formatDate(b.created_at)}</dd>
            </div>
          </dl>
        );
        return (
          <li key={b.id} className={`session-card admin-booking admin-booking--${b.status}`}>
            <div className="admin-booking-head">
              <h3 className="session-date">{date}</h3>
              <span className="admin-booking-tags">
                {b.source === "admin" ? <span className="source-tag">Added by you</span> : null}
                {b.updated_at ? <span className="source-tag">Edited</span> : null}
                <span className={`status-badge status-badge--${b.status}`}>{STATUS_LABEL[b.status]}</span>
              </span>
            </div>
            {readOnly ? (
              details
            ) : (
              <EditableBooking
                booking={b}
                canEdit={b.status !== "cancelled" && Date.parse(b.starts_at) > now}
                details={details}
                actions={
                  <BookingStatusButtons
                    id={b.id}
                    status={b.status}
                    who={`${b.name} on ${date}`}
                    clientFirstName={firstName(b.name)}
                    when={formatDayMonthTime(b.starts_at)}
                    hasEmail={b.email !== null}
                    canResend={b.status === "confirmed" && b.email !== null && Date.parse(b.starts_at) > now}
                  />
                }
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
