/**
 * The kinds of session a client can ask for. The one definition the booking
 * form, `submitBooking`, the emails and /admin all use. The ids are what the
 * database stores (`booking_requests.session_type`, migration 0011, which
 * allows only these). `SITE.pricing` keeps its own copy of the ids, titles and
 * intros; a unit test fails if the two drift apart.
 */
export const SESSION_TYPES = [
  {
    id: "one-on-one",
    title: "1-on-1 training",
    intro: "Just you and your trainer.",
    /** The short label on the trainer's booking card. */
    tag: "1-on-1",
  },
  {
    id: "partner",
    title: "Partner training",
    intro: "Train with a partner. Prices cover both of you.",
    tag: "Partner",
  },
] as const;

export type SessionType = (typeof SESSION_TYPES)[number]["id"];

/** Shown on the form, and returned by `submitBooking`, when no session type was chosen. */
export const SESSION_TYPE_REQUIRED = "Please choose 1-on-1 or partner training.";

const byId = (id: SessionType) => SESSION_TYPES.find((t) => t.id === id)!;

export function isSessionType(value: unknown): value is SessionType {
  return SESSION_TYPES.some((t) => t.id === value);
}

/** A stored `session_type` as a SessionType, or null when none was recorded. */
export const toSessionType = (value: unknown): SessionType | null => (isSessionType(value) ? value : null);

/** "1-on-1 training" or "Partner training". */
export const sessionTypeTitle = (id: SessionType) => byId(id).title;

/** "1-on-1" or "Partner". */
export const sessionTypeTag = (id: SessionType) => byId(id).tag;
