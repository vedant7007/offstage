/**
 * The one time helper. Store UTC, display Asia/Kolkata.
 *
 * India Standard Time is a fixed UTC+05:30 with no daylight saving, so conversions
 * are plain offset arithmetic. We avoid Intl date formatting here because its output
 * (for example "am" vs "AM", or narrow spaces) varies between Node and browser ICU builds.
 */

export const IST_TIME_ZONE = "Asia/Kolkata";
export const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DateInput = Date | string | number;

export interface IstParts {
  year: number;
  /** 1 to 12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 is Sunday */
  weekday: number;
}

export function toDate(input: DateInput): Date {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${String(input)}`);
  return d;
}

/** Current instant. Use this instead of `new Date()` so tests can reason about one entry point. */
export function nowUtc(): Date {
  return new Date();
}

/** ISO 8601 string in UTC, the only format we store and send over the wire. */
export function toUtcIso(input: DateInput): string {
  return toDate(input).toISOString();
}

/** Wall clock parts of an instant as seen in IST. */
export function toIstParts(input: DateInput): IstParts {
  const shifted = new Date(toDate(input).getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

/**
 * Convert an IST wall clock time to a UTC instant.
 * Accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" (what a datetime-local input gives).
 */
export function istToUtc(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim());
  if (!m) throw new RangeError(`Expected YYYY-MM-DD or YYYY-MM-DDTHH:mm, got: ${local}`);
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return new Date(utcMs - IST_OFFSET_MS);
}

/** "YYYY-MM-DDTHH:mm" in IST, the value a datetime-local input expects. */
export function toIstInputValue(input: DateInput): string {
  const p = toIstParts(input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DD" of the IST calendar day. Useful as a grouping key. */
export function istDateKey(input: DateInput): string {
  const p = toIstParts(input);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** UTC instants for the start (inclusive) and end (exclusive) of the IST day containing `input`. */
export function istDayBounds(input: DateInput): { start: Date; end: Date } {
  const start = istToUtc(istDateKey(input));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** "24 Oct 2026" */
export function formatDate(input: DateInput): string {
  const p = toIstParts(input);
  return `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}`;
}

/** "Sat, 24 Oct" */
export function formatDayShort(input: DateInput): string {
  const p = toIstParts(input);
  return `${WEEKDAYS_SHORT[p.weekday]}, ${p.day} ${MONTHS_SHORT[p.month - 1]}`;
}

/** "10:30 AM" */
export function formatTime(input: DateInput): string {
  const p = toIstParts(input);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`;
}

/** "24 Oct 2026, 10:30 AM" */
export function formatDateTime(input: DateInput): string {
  return `${formatDate(input)}, ${formatTime(input)}`;
}

/** "10:30 AM - 11:15 AM" on the same IST day, otherwise both full date times. */
export function formatRange(start: DateInput, end: DateInput): string {
  if (istDateKey(start) === istDateKey(end)) return `${formatTime(start)} - ${formatTime(end)}`;
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

/** "in 15 min", "3 h ago", "just now". Coarse on purpose; for exact times use formatTime. */
export function formatRelative(input: DateInput, now: DateInput = nowUtc()): string {
  const diffMs = toDate(input).getTime() - toDate(now).getTime();
  const abs = Math.abs(diffMs);
  const future = diffMs > 0;
  if (abs < 45_000) return "just now";
  const minutes = Math.round(abs / 60_000);
  let text: string;
  if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 60 * 24) text = `${Math.round(minutes / 60)} h`;
  else text = `${Math.round(minutes / (60 * 24))} d`;
  return future ? `in ${text}` : `${text} ago`;
}

/**
 * True when the IST wall clock time of `input` falls inside [startHour, endHour),
 * wrapping past midnight when startHour > endHour. Default is the 22:00 to 07:00 quiet window.
 */
export function isWithinIstHours(input: DateInput, startHour = 22, endHour = 7): boolean {
  const { hour } = toIstParts(input);
  return startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

export function addMinutes(input: DateInput, minutes: number): Date {
  return new Date(toDate(input).getTime() + minutes * 60_000);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
