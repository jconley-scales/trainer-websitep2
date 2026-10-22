"use client";

import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export type SessionCardData = {
  /** Booking id, passed to the cancel action. */
  id: string;
  /** e.g. "Tuesday, March 5, 2030" (formatted on the server). */
  dateLabel: string;
  /** e.g. "10:00 AM to 11:00 AM" */
  timeLabel: string;
  /** e.g. "10:00 AM", used in the confirmation question. */
  startLabel: string;
  trainerName: string;
  location: string;
};

type SessionCardProps = {
  session: SessionCardData;
  cancelAction: (bookingId: string) => Promise<void>;
};

const CANCEL_FAILED =
  "We could not cancel your session just now. Please check your internet connection and try again.";

export function SessionCard({ session, cancelAction }: SessionCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel() {
    setPending(true);
    setError(null);
    try {
      await cancelAction(session.id);
    } catch {
      setError(CANCEL_FAILED);
      setPending(false);
      // Reopen in case the dialog was closed (e.g. Escape) while we were working,
      // so the error is never invisible.
      setConfirming(true);
      return;
    }
    setPending(false);
    setConfirming(false);
  }

  return (
    <li className="session-card">
      <h2 className="session-date">{session.dateLabel}</h2>
      <dl className="session-details">
        <div>
          <dt>Time</dt>
          <dd>{session.timeLabel}</dd>
        </div>
        <div>
          <dt>Trainer</dt>
          <dd>{session.trainerName}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{session.location}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="button-secondary"
        aria-label={`Cancel this session on ${session.dateLabel} at ${session.startLabel}`}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Cancel this session
      </button>
      <ConfirmDialog
        open={confirming}
        title="Cancel this session?"
        confirmLabel="Yes, cancel session"
        cancelLabel="No, keep my session"
        onConfirm={confirmCancel}
        onCancel={() => setConfirming(false)}
        pending={pending}
        error={error}
      >
        <p>
          You are about to cancel your session on{" "}
          <strong>
            {session.dateLabel} at {session.startLabel}
          </strong>{" "}
          with {session.trainerName}.
        </p>
      </ConfirmDialog>
    </li>
  );
}
