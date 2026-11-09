/** The longest note the trainer can add to a confirmation email. Shared by the form and the server action. */
export const CONFIRM_NOTE_MAX = 500;

/** The longest reason the trainer can add to a cancellation email. Shared by the form and the server action. */
export const CANCEL_REASON_MAX = 500;

/** Limits on a booking the trainer adds. Shared by the form and the server action; the text limits match the database's. */
export const BOOKING_NAME_MAX = 120;
export const BOOKING_EMAIL_MAX = 200;
export const BOOKING_PHONE_MAX = 40;
export const BOOKING_NOTE_MAX = 2000;

/** Start times are on the quarter hour; lengths are quarter hours, up to 4 hours. */
export const BOOKING_STEP_MINUTES = 15;
export const BOOKING_LENGTHS = Array.from({ length: 16 }, (_, i) => (i + 1) * BOOKING_STEP_MINUTES);
export const BOOKING_DEFAULT_MINUTES = 60;
