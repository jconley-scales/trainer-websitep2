/** In person (the trainer comes to you) or virtual (live over video). Each has its own schedule. */
export type SessionFormat = "in-person" | "virtual";

/**
 * The kinds of session a client can ask for. The one definition the booking
 * form, `submitBooking`, the emails and /admin all use. The ids are what the
 * database stores (`booking_requests.session_type`, migrations 0011 and 0012,
 * which allow only these). `format` picks the schedule in
 * lib/booking-availability.ts. `SITE.pricing` keeps its own copy of the ids, titles and
 * intros; a unit test fails if the two drift apart.
 */
export const SESSION_TYPES = [
  {
    id: "one-on-one",
    title: "1-on-1 training",
    intro: "Just you and your trainer, in person.",
    /** The short label on the trainer's booking card. */
    tag: "1-on-1",
    format: "in-person",
  },
  {
    id: "partner",
    title: "Partner training",
    intro: "Train with a partner, in person. Prices cover both of you.",
    tag: "Partner",
    format: "in-person",
  },
  {
    id: "virtual-one-on-one",
    title: "Virtual 1-on-1 training",
    intro: "Just you and your trainer, live over video.",
    tag: "Virtual 1-on-1",
    format: "virtual",
  },
  {
    id: "virtual-partner",
    title: "Virtual partner training",
    intro: "Train with a partner, live over video. Prices cover both of you.",
    tag: "Virtual partner",
    format: "virtual",
  },
] as const;

export type SessionType = (typeof SESSION_TYPES)[number]["id"];

/** Shown on the form, and returned by `submitBooking`, when no session type was chosen. */
export const SESSION_TYPE_REQUIRED = "Please choose the kind of session you would like.";

const byId = (id: SessionType) => SESSION_TYPES.find((t) => t.id === id)!;

export function isSessionType(value: unknown): value is SessionType {
  return SESSION_TYPES.some((t) => t.id === value);
}

/** A stored `session_type` as a SessionType, or null when none was recorded. */
export const toSessionType = (value: unknown): SessionType | null => (isSessionType(value) ? value : null);

/** E.g. "1-on-1 training" or "Virtual partner training". */
export const sessionTypeTitle = (id: SessionType) => byId(id).title;

/** E.g. "1-on-1" or "Virtual partner". */
export const sessionTypeTag = (id: SessionType) => byId(id).tag;

/** Whether the session is in person or virtual, which decides its schedule. */
export const sessionTypeFormat = (id: SessionType): SessionFormat => byId(id).format;
