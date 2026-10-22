"use client";

import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export type SlotRowData = {
  /** Slot id, passed to the book action. */
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

type SlotRowProps = {
  slot: SlotRowData;
  bookAction: (slotId: string) => Promise<void>;
};

const BOOK_FAILED =
  "We could not book your session just now. Please check your internet connection and try again.";

/**
 * One open time, as a single large button: tapping it asks "Book your session on
 * <day, date> at <time>?" before anything is booked. The whole row is the tap
 * target (the .slot-row class is a block-level flex button, so its min-height
 * really applies). The date is in the accessible name too, so a screen reader
 * user tabbing through rows hears which day each one is on.
 */
export function SlotRow({ slot, bookAction }: SlotRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmBook() {
    setPending(true);
    setError(null);
    try {
      // On success the action redirects (to /sessions, or back to /book with a
      // message), which navigates away from here.
      await bookAction(slot.id);
    } catch {
      setError(BOOK_FAILED);
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
    <li>
      <button
        type="button"
        className="slot-row"
        onClick={() => {
          setError(null);
          // A previous attempt may have navigated away without ever finishing here.
          setPending(false);
          setConfirming(true);
        }}
      >
        <span className="visually-hidden">{slot.dateLabel}, </span>
        <span className="slot-time">{slot.timeLabel}</span>
        <span className="slot-detail">
          {slot.location} with {slot.trainerName}
        </span>
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Book your session on ${slot.dateLabel} at ${slot.startLabel}?`}
        confirmLabel="Yes, book this session"
        cancelLabel="No, go back"
        pendingLabel="Booking..."
        tone="primary"
        onConfirm={confirmBook}
        onCancel={() => setConfirming(false)}
        pending={pending}
        error={error}
      >
        <p>
          <strong>
            {slot.dateLabel} at {slot.timeLabel}
          </strong>
        </p>
        <p>
          {slot.location}, with {slot.trainerName}.
        </p>
      </ConfirmDialog>
    </li>
  );
}
