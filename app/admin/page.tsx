import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatDate, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { BookingStatusButtons } from "./booking-status-buttons";

export const metadata: Metadata = { title: "Bookings" };

type Booking = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  starts_at: string;
  ends_at: string;
  status: "new" | "confirmed" | "cancelled";
  created_at: string;
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

  const { upcoming, past } = bookings;
  const newCount = upcoming.filter((b) => b.status === "new").length;

  return (
    <>
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
          <BookingCards bookings={upcoming} />
        )}
      </section>

      {past.length > 0 ? (
        <details className="admin-past">
          <summary>Past bookings ({past.length})</summary>
          <BookingCards bookings={past} readOnly />
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
): Promise<{ upcoming: Booking[]; past: Booking[] } | null> {
  const { data, error } = await db
    .from("booking_requests")
    .select("id, name, email, phone, note, starts_at, ends_at, status, created_at")
    .order("starts_at", { ascending: true })
    .overrideTypes<Booking[], { merge: false }>();
  if (error) return null;
  const now = Date.now();
  return {
    upcoming: data.filter((b) => Date.parse(b.ends_at) >= now),
    past: data.filter((b) => Date.parse(b.ends_at) < now).reverse(),
  };
}

function BookingCards({ bookings, readOnly = false }: { bookings: Booking[]; readOnly?: boolean }) {
  return (
    <ul className="session-list">
      {bookings.map((b) => {
        const date = formatDate(b.starts_at);
        return (
          <li key={b.id} className={`session-card admin-booking admin-booking--${b.status}`}>
            <div className="admin-booking-head">
              <h3 className="session-date">{date}</h3>
              <span className={`status-badge status-badge--${b.status}`}>{STATUS_LABEL[b.status]}</span>
            </div>
            <dl className="session-details">
              <div>
                <dt>Time</dt>
                <dd>{formatTimeRange(b.starts_at, b.ends_at)}</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{b.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${b.email}`}>{b.email}</a>
                </dd>
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
                <dt>Requested</dt>
                <dd>{formatDate(b.created_at)}</dd>
              </div>
            </dl>
            {readOnly ? null : (
              <BookingStatusButtons id={b.id} status={b.status} who={`${b.name} on ${date}`} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
