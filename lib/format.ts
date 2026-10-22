/**
 * Date and time display for the portal.
 *
 * Slot times are stored in UTC. Everything the client sees is shown in ONE
 * place-based time zone (the gym's), so a session always reads the same no
 * matter where the visitor's device is set. Change DISPLAY_TIME_ZONE here once
 * the gym's real time zone is known (an IANA name, e.g. "America/Chicago").
 */
export const DISPLAY_TIME_ZONE = "America/New_York";

const LOCALE = "en-US";

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

// Newer ICU versions put a narrow no-break space before AM/PM; use a plain space
// so the text is consistent everywhere (and easy to match).
const plain = (s: string) => s.replace(/[  ]/g, " ");

/** "Tuesday, March 5, 2030" */
export function formatDate(iso: string): string {
  return plain(dateFormat.format(new Date(iso)));
}

/** "10:00 AM" */
export function formatTime(iso: string): string {
  return plain(timeFormat.format(new Date(iso)));
}

/** "10:00 AM to 11:00 AM" ("to" reads more clearly than a dash, also aloud). */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} to ${formatTime(endIso)}`;
}
