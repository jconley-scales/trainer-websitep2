import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SessionCard } from "@/components/SessionCard";
import { listUpcomingSessions } from "@/lib/booking";
import { formatDate, formatTime, formatTimeRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getTrainerNames } from "@/lib/trainers";
import { cancelBookingAction } from "../actions";

export const metadata: Metadata = {
  title: "Your sessions - Training Portal",
};

/**
 * The heading and the Book button never depend on who is signed in, so they are
 * part of the static shell. Reading the session cookie is request-time work, so
 * the list streams in behind a Suspense boundary (required with cacheComponents).
 */
export default function SessionsPage() {
  return (
    <>
      <h1 id="sessions-heading" tabIndex={-1}>
        Your upcoming sessions
      </h1>
      <p>
        <Link className="button" href="/book">
          Book a session
        </Link>
      </p>
      <Suspense fallback={<p role="status">Loading your sessions...</p>}>
        <SessionList />
      </Suspense>
    </>
  );
}

async function SessionList() {
  // Everything below depends on the request (session cookie, current time), and
  // the Supabase client reads the clock internally, so opt into request-time
  // rendering explicitly instead of letting it trip the prerender check.
  await connection();
  // The authenticated client: row level security limits everything to this user.
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const [sessions, trainerNames] = await Promise.all([
    listUpcomingSessions(db, user.id, new Date()),
    getTrainerNames(db),
  ]);

  if (sessions.length === 0) {
    return (
      <p className="empty-state">
        You have no upcoming sessions. Choose &ldquo;Book a session&rdquo; to
        pick a time.
      </p>
    );
  }

  return (
    <ul className="session-list" role="list">
      {sessions.map((s) => (
        <SessionCard
          key={s.id}
          cancelAction={cancelBookingAction}
          session={{
            id: s.id,
            dateLabel: formatDate(s.starts_at),
            timeLabel: formatTimeRange(s.starts_at, s.ends_at),
            startLabel: formatTime(s.starts_at),
            trainerName: trainerNames.get(s.trainer_id) ?? "Your trainer",
            location: s.location ?? "Location to be announced",
          }}
        />
      ))}
    </ul>
  );
}
