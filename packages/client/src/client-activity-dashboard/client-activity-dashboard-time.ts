// Clock labels for Chronicle rows. A bare "00:45" read the same for today and
// last night, so a truce's original and extended end looked identical
// (playtest run 2): anything not today names its day.

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Local calendar day, so "today" follows the player's midnight, not UTC's. */
export const localDayKey = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const clock = (date: Date): string => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

/** Whole local days from now's day to at's day (negative in the past). */
const dayOffset = (at: number, nowMs: number): number => {
  const a = new Date(at);
  const n = new Date(nowMs);
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / DAY_MS);
};

/** "00:45" today, "yesterday 00:45", "tomorrow 00:45", "Sun 00:45" within a week, else "12 Nov 00:45". */
export const relativeDayTimeLabel = (at: number, nowMs: number): string => {
  const date = new Date(at);
  const offset = dayOffset(at, nowMs);
  if (offset === 0) return clock(date);
  if (offset === -1) return `yesterday ${clock(date)}`;
  if (offset === 1) return `tomorrow ${clock(date)}`;
  if (Math.abs(offset) < 7) return `${WEEKDAYS[date.getDay()]} ${clock(date)}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${clock(date)}`;
};

/** Bare "21:54" in local time. */
export const clockLabel = (at: number): string => clock(new Date(at));

/**
 * Short day tag that fits the Chronicle's narrow time column: none today,
 * "Sun" within a week, else "12 Nov". "yesterday" is too wide for it.
 */
export const shortDayTag = (at: number, nowMs: number): string | undefined => {
  const date = new Date(at);
  const offset = dayOffset(at, nowMs);
  if (offset === 0) return undefined;
  if (Math.abs(offset) < 7) return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};
