/**
 * Date and time display for the site.
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

const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** "Tuesday, March 5": for near-term dates, where the year only adds noise. */
export function formatDayMonth(iso: string): string {
  return plain(dayMonthFormat.format(new Date(iso)));
}

const zoneNameFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  timeZoneName: "longGeneric",
});

/** "Eastern time": the display time zone named in words, as of the given instant. */
export function formatTimeZoneName(iso: string): string {
  const name = zoneNameFormat.formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value;
  return (name ?? DISPLAY_TIME_ZONE).replace(/ Time$/, " time");
}

/** "Jordan" from "Jordan Tester": the first word of a name, for a friendly greeting. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** "Tuesday, March 5 at 10:00 AM": one moment, as the confirm panel and email name it. */
export function formatDayMonthTime(iso: string): string {
  return `${formatDayMonth(iso)} at ${formatTime(iso)}`;
}

/** "10:00 AM to 11:00 AM" ("to" reads more clearly than a dash, also aloud). */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} to ${formatTime(endIso)}`;
}

const usdFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const usdCentsFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$85", "$1,050", "$78.50": whole dollars drop the cents; otherwise both cent digits show. */
export function formatUsd(amount: number): string {
  return (Number.isInteger(amount) ? usdFormat : usdCentsFormat).format(amount);
}
