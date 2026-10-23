"use client";

import { useState, useTransition } from "react";
import { setBookingStatus } from "./actions";

type Status = "new" | "confirmed" | "cancelled";

/** The actions that make sense for each state, in priority order. */
const ACTIONS: Record<Status, { to: Status; label: string; className: string }[]> = {
  new: [
    { to: "confirmed", label: "Confirm", className: "button button--accent" },
    { to: "cancelled", label: "Cancel", className: "button button-danger" },
  ],
  confirmed: [{ to: "cancelled", label: "Cancel", className: "button button-danger" }],
  cancelled: [{ to: "new", label: "Reopen", className: "button button-secondary" }],
};

export function BookingStatusButtons({
  id,
  status,
  who,
}: {
  id: string;
  status: Status;
  /** e.g. "Jordan Tester on Friday, October 23", for button labels and the cancel check. */
  who: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(to: Status) {
    // Cancelling frees the time for someone else; make it a deliberate choice.
    if (to === "cancelled" && !window.confirm(`Cancel the booking for ${who}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await setBookingStatus(id, to);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="stack">
      <div className="button-row">
        {ACTIONS[status].map((action) => (
          <button
            key={action.to}
            type="button"
            className={action.className}
            disabled={pending}
            onClick={() => change(action.to)}
          >
            {action.label}
            <span className="visually-hidden"> the booking for {who}</span>
          </button>
        ))}
      </div>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
