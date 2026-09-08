/**
 * dates/* — ISO 8601 date handling. Every function works in UTC so results
 * never depend on the host's timezone. Inputs without an explicit offset are
 * treated as UTC.
 */

import { z } from "zod";
import { UTCDate } from "@date-fns/utc";
import { TZDate } from "@date-fns/tz";
import {
  add as dfAdd,
  addDays as dfAddDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInCalendarYears,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  getDayOfYear,
  getDaysInMonth,
  getISOWeek,
  getISOWeekYear,
  getQuarter,
  isLeapYear,
  parse,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Strictly parse an ISO 8601 date or date-time to a UTCDate. Rejects
 * impossible calendar dates (Feb 30) instead of rolling them over. A missing
 * offset means UTC.
 */
export function parseIso(input: string): UTCDate {
  const m = ISO_RE.exec(input.trim());
  if (!m)
    fail(
      "INVALID_DATE",
      `"${input}" is not an ISO 8601 date (expected YYYY-MM-DD[THH:mm[:ss[.sss]]][Z|±HH:mm])`
    );
  const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "0", offset] = m;
  const ms = Number(frac.padEnd(3, "0").slice(0, 3));
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms);
  const probe = new Date(utc);
  const valid =
    probe.getUTCFullYear() === +y &&
    probe.getUTCMonth() === +mo - 1 &&
    probe.getUTCDate() === +d &&
    +h < 24 &&
    +mi < 60 &&
    +s < 60;
  if (!valid) fail("INVALID_DATE", `"${input}" is not a real calendar date/time`);
  let shift = 0;
  if (offset && offset.toUpperCase() !== "Z") {
    const sign = offset[0] === "-" ? -1 : 1;
    const digits = offset.slice(1).replace(":", "");
    shift = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  return new UTCDate(utc - shift);
}

/** Parse with a date-fns format pattern; fields the pattern omits default to 1970-01-01T00:00:00Z. */
export function parseWithFormat(input: string, pattern: string): UTCDate {
  const date = parse(input, pattern, new UTCDate(1970, 0, 1));
  if (Number.isNaN(date.getTime()))
    fail("INVALID_DATE", `"${input}" does not match format "${pattern}"`);
  return new UTCDate(date.getTime());
}

export const parseDate = (input: string, pattern?: string): string =>
  (pattern ? parseWithFormat(input, pattern) : parseIso(input)).toISOString();

export function formatDate(isoDate: string, pattern: string): string {
  try {
    return format(parseIso(isoDate), pattern);
  } catch (error) {
    if (error instanceof RangeError) fail("INVALID_FORMAT", error.message);
    throw error;
  }
}

export const addDays = (isoDate: string, days: number): string =>
  dfAddDays(parseIso(isoDate), days).toISOString();

/** Whole UTC calendar days from `from` to `to`; negative when `to` is earlier. */
export const diffDays = (from: string, to: string): number =>
  differenceInCalendarDays(parseIso(to), parseIso(from));

/** Unix epoch time of an ISO instant, as whole seconds (floored) and milliseconds. */
export function toUnix(isoDate: string): { seconds: number; milliseconds: number } {
  const milliseconds = parseIso(isoDate).getTime();
  return { seconds: Math.floor(milliseconds / 1000), milliseconds };
}

export type UnixUnit = "seconds" | "milliseconds";

/** ISO instant for a Unix timestamp. Fractional input is rounded to the nearest millisecond. */
export function fromUnix(timestamp: number, unit: UnixUnit = "seconds"): string {
  if (unit === "seconds" && Math.abs(timestamp) > 1e11) {
    fail(
      "AMBIGUOUS_TIMESTAMP",
      `${timestamp} looks like milliseconds (|value| > 1e11); pass unit: "milliseconds"`
    );
  }
  const ms = Math.round(unit === "seconds" ? timestamp * 1000 : timestamp);
  if (Math.abs(ms) > 8.64e15)
    fail("INVALID_TIMESTAMP", `${timestamp} ${unit} is outside the representable range`);
  return new UTCDate(ms).toISOString();
}

export const DIFF_UNITS = [
  "days",
  "milliseconds",
  "seconds",
  "minutes",
  "hours",
  "weeks",
  "months",
  "years",
] as const;
export type DiffUnit = (typeof DIFF_UNITS)[number];

const MONDAY = { weekStartsOn: 1 } as const;

/**
 * Signed difference `to − from`. Days, weeks (Monday-start), months and years
 * count whole UTC calendar units crossed; the smaller units are exact and may
 * be fractional.
 */
export function diff(from: string, to: string, unit: DiffUnit = "days"): number {
  const a = parseIso(from);
  const b = parseIso(to);
  const ms = b.getTime() - a.getTime();
  switch (unit) {
    case "milliseconds":
      return ms;
    case "seconds":
      return ms / 1000;
    case "minutes":
      return ms / 60_000;
    case "hours":
      return ms / 3_600_000;
    case "days":
      return differenceInCalendarDays(b, a);
    case "weeks":
      return differenceInCalendarWeeks(b, a, MONDAY);
    case "months":
      return differenceInCalendarMonths(b, a);
    case "years":
      return differenceInCalendarYears(b, a);
  }
}

export const ADD_UNITS = [
  "days",
  "seconds",
  "minutes",
  "hours",
  "weeks",
  "months",
  "years",
] as const;
export type AddUnit = (typeof ADD_UNITS)[number];

/** Add `amount` of `unit` in UTC. Month and year arithmetic clamps to the last day of the month. */
export const add = (isoDate: string, amount: number, unit: AddUnit = "days"): string =>
  dfAdd(parseIso(isoDate), { [unit]: amount }).toISOString();

const DURATION_RE =
  /^(-)?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

export interface ParsedDuration {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Parse an ISO 8601 duration (P1Y2M3DT4H5M6S, PT30M, P2W, optionally negative). */
export function parseDuration(duration: string): ParsedDuration {
  const m = DURATION_RE.exec(duration.trim());
  // The lookahead after T rejects a dangling designator (P1DT); this rejects a bare P.
  if (!m || m.slice(2).every((part) => part === undefined)) {
    fail(
      "INVALID_DURATION",
      `"${duration}" is not an ISO 8601 duration (e.g. P1Y2M3DT4H5M6S, PT30M, P2W)`
    );
  }
  const sign = m[1] ? -1 : 1;
  const n = (s: string | undefined) => (s === undefined ? 0 : sign * Number(s));
  return {
    years: n(m[2]),
    months: n(m[3]),
    weeks: n(m[4]),
    days: n(m[5]),
    hours: n(m[6]),
    minutes: n(m[7]),
    seconds: n(m[8]),
  };
}

/** Add an ISO 8601 duration to an ISO date, in UTC. Larger units are applied first, then time. */
export function addDuration(isoDate: string, duration: string): string {
  const d = parseDuration(duration);
  const date = parseIso(isoDate);
  const withCalendar = dfAdd(date, {
    years: d.years,
    months: d.months,
    weeks: d.weeks,
    days: d.days,
  });
  const ms = Math.round(((d.hours * 60 + d.minutes) * 60 + d.seconds) * 1000);
  return new UTCDate(withCalendar.getTime() + ms).toISOString();
}

export const PERIOD_UNITS = ["day", "week", "month", "quarter", "year"] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];

/** First instant of the UTC period containing the date. Weeks start on Monday (ISO 8601). */
export function startOf(isoDate: string, unit: PeriodUnit = "day"): string {
  const d = parseIso(isoDate);
  switch (unit) {
    case "day":
      return startOfDay(d).toISOString();
    case "week":
      return startOfWeek(d, MONDAY).toISOString();
    case "month":
      return startOfMonth(d).toISOString();
    case "quarter":
      return startOfQuarter(d).toISOString();
    case "year":
      return startOfYear(d).toISOString();
  }
}

/** Last millisecond of the UTC period containing the date. Weeks end on Sunday (ISO 8601). */
export function endOf(isoDate: string, unit: PeriodUnit = "day"): string {
  const d = parseIso(isoDate);
  switch (unit) {
    case "day":
      return endOfDay(d).toISOString();
    case "week":
      return endOfWeek(d, MONDAY).toISOString();
    case "month":
      return endOfMonth(d).toISOString();
    case "quarter":
      return endOfQuarter(d).toISOString();
    case "year":
      return endOfYear(d).toISOString();
  }
}

export interface DateInfo {
  iso: string;
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  weekdayName: string;
  dayOfYear: number;
  isoWeek: number;
  isoWeekYear: number;
  quarter: number;
  isLeapYear: boolean;
  isWeekend: boolean;
  daysInMonth: number;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Calendar facts about an ISO date, computed in UTC. */
export function info(isoDate: string): DateInfo {
  const d = parseIso(isoDate);
  const weekday = d.getUTCDay();
  return {
    iso: d.toISOString(),
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday,
    weekdayName: WEEKDAY_NAMES[weekday],
    dayOfYear: getDayOfYear(d),
    isoWeek: getISOWeek(d),
    isoWeekYear: getISOWeekYear(d),
    quarter: getQuarter(d),
    isLeapYear: isLeapYear(d),
    isWeekend: weekday === 0 || weekday === 6,
    daysInMonth: getDaysInMonth(d),
  };
}

export interface ZonedDate {
  /** Wall-clock time in the zone with its numeric offset, e.g. 2025-07-04T08:00:00.000-04:00 */
  iso: string;
  /** ±HH:mm */
  offset: string;
  /** Minutes east of UTC (negative west), e.g. -240 for EDT */
  offsetMinutes: number;
  timeZone: string;
  /** Short zone name in the en-US locale (EDT, GMT+5:30, …) */
  abbreviation: string;
}

function assertTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    fail("INVALID_TIMEZONE", `"${timeZone}" is not a known IANA time zone (e.g. America/New_York)`);
  }
}

/** Express a UTC instant as wall-clock time in an IANA time zone, DST-aware. */
export function toTimezone(isoDate: string, timeZone: string): ZonedDate {
  assertTimeZone(timeZone);
  const instant = parseIso(isoDate);
  const zoned = new TZDate(instant.getTime(), timeZone);
  const abbreviation =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? format(zoned, "xxx");
  return {
    iso: format(zoned, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
    offset: format(zoned, "xxx"),
    offsetMinutes: -zoned.getTimezoneOffset(),
    timeZone,
    abbreviation,
  };
}

const iso = (description: string) =>
  z.string().describe(`${description} (ISO 8601; no offset means UTC)`);

export const functions = [
  defineFunction({
    name: "dates/parseDate",
    description:
      "Normalize a date string to full ISO 8601 UTC (2025-12-11T00:00:00.000Z). Accepts ISO dates/date-times, or any layout when `format` is given (date-fns tokens, e.g. dd/MM/yyyy). Never depends on the host timezone.",
    input: z.object({
      input: z.string().describe("Date string to parse"),
      format: z
        .string()
        .optional()
        .describe("date-fns format pattern when the input is not ISO 8601"),
    }),
    returns: "ISO 8601 UTC timestamp",
    tags: ["date", "parse", "iso", "normalize", "utc"],
    examples: [
      {
        description: "Date only",
        input: { input: "2025-12-11" },
        output: "2025-12-11T00:00:00.000Z",
      },
      {
        description: "With offset",
        input: { input: "2025-12-11T10:00:00+02:00" },
        output: "2025-12-11T08:00:00.000Z",
      },
      {
        description: "Custom format",
        input: { input: "11/12/2025", format: "dd/MM/yyyy" },
        output: "2025-12-11T00:00:00.000Z",
      },
    ],
    run: (a) => parseDate(a.input, a.format),
  }),
  defineFunction({
    name: "dates/formatDate",
    description:
      "Render an ISO date with a date-fns pattern (yyyy-MM-dd, MMMM d yyyy, HH:mm, EEEE …) in UTC.",
    input: z.object({
      isoDate: iso("Date to format"),
      format: z.string().describe("date-fns format pattern, e.g. 'yyyy-MM-dd' or 'MMMM d, yyyy'"),
    }),
    returns: "formatted string",
    tags: ["date", "format", "display", "pattern"],
    examples: [
      {
        description: "Long form",
        input: { isoDate: "2025-12-11T00:00:00.000Z", format: "MMMM d, yyyy" },
        output: "December 11, 2025",
      },
      {
        description: "Time",
        input: { isoDate: "2025-12-11T15:04:05Z", format: "HH:mm" },
        output: "15:04",
      },
    ],
    run: (a) => formatDate(a.isoDate, a.format),
  }),
  defineFunction({
    name: "dates/addDays",
    description: "Add (or with a negative count, subtract) whole days to an ISO date, in UTC.",
    input: z.object({
      isoDate: iso("Starting date"),
      days: z.number().int().describe("Days to add; negative subtracts"),
    }),
    returns: "ISO 8601 UTC timestamp",
    tags: ["date", "add", "subtract", "arithmetic", "days"],
    examples: [
      {
        description: "Plus a week",
        input: { isoDate: "2025-12-11", days: 7 },
        output: "2025-12-18T00:00:00.000Z",
      },
      {
        description: "Minus a day",
        input: { isoDate: "2026-01-01", days: -1 },
        output: "2025-12-31T00:00:00.000Z",
      },
    ],
    run: (a) => addDays(a.isoDate, a.days),
  }),
  defineFunction({
    name: "dates/diffDays",
    description:
      "Whole UTC calendar days between two ISO dates (`to` minus `from`). Negative when `to` is earlier.",
    input: z.object({ from: iso("Start date"), to: iso("End date") }),
    returns: "signed integer number of days",
    tags: ["date", "diff", "difference", "between", "days"],
    examples: [
      { description: "One week", input: { from: "2026-01-01", to: "2026-01-08" }, output: 7 },
      {
        description: "Crossing midnight",
        input: { from: "2026-01-01T23:00:00Z", to: "2026-01-02T01:00:00Z" },
        output: 1,
      },
    ],
    run: (a) => diffDays(a.from, a.to),
  }),
  defineFunction({
    name: "dates/toUnix",
    description: "Convert an ISO date to a Unix timestamp, as both whole seconds and milliseconds.",
    input: z.object({ isoDate: iso("Date to convert") }),
    returns: "object with seconds (integer, floored) and milliseconds (integer)",
    tags: ["date", "unix", "epoch", "timestamp", "seconds"],
    examples: [
      {
        description: "Epoch offset",
        input: { isoDate: "2025-07-04T12:00:00Z" },
        output: { seconds: 1751630400, milliseconds: 1751630400000 },
      },
    ],
    run: (a) => toUnix(a.isoDate),
  }),
  defineFunction({
    name: "dates/fromUnix",
    description:
      'Convert a Unix timestamp to ISO 8601 UTC. Pass unit: "milliseconds" for JavaScript-style timestamps; a seconds value above 1e11 is rejected as ambiguous.',
    input: z.object({
      timestamp: z.number().finite().describe("Unix timestamp"),
      unit: z
        .enum(["seconds", "milliseconds"])
        .default("seconds")
        .describe("Unit of the timestamp"),
    }),
    returns: "ISO 8601 UTC timestamp",
    tags: ["date", "unix", "epoch", "timestamp", "convert"],
    examples: [
      {
        description: "Seconds",
        input: { timestamp: 1751630400 },
        output: "2025-07-04T12:00:00.000Z",
      },
      {
        description: "Milliseconds",
        input: { timestamp: 1751630400123, unit: "milliseconds" },
        output: "2025-07-04T12:00:00.123Z",
      },
    ],
    run: (a) => fromUnix(a.timestamp, a.unit),
  }),
  defineFunction({
    name: "dates/diff",
    description:
      "Signed difference between two ISO dates (`to` minus `from`) in a chosen unit. Days, weeks (Monday start), months and years count whole UTC calendar boundaries crossed; milliseconds, seconds, minutes and hours are exact.",
    input: z.object({
      from: iso("Start date"),
      to: iso("End date"),
      unit: z.enum(DIFF_UNITS).default("days").describe("Unit of the result"),
    }),
    returns: "signed number (integer for calendar units, may be fractional for time units)",
    tags: ["date", "diff", "difference", "between", "duration", "months", "hours"],
    examples: [
      {
        description: "Calendar months",
        input: { from: "2025-01-31", to: "2025-03-01", unit: "months" },
        output: 2,
      },
      {
        description: "Exact hours",
        input: { from: "2025-01-01T00:00:00Z", to: "2025-01-01T01:30:00Z", unit: "hours" },
        output: 1.5,
      },
      { description: "Negative days", input: { from: "2025-01-10", to: "2025-01-01" }, output: -9 },
    ],
    run: (a) => diff(a.from, a.to, a.unit),
  }),
  defineFunction({
    name: "dates/add",
    description:
      "Add (or with a negative amount, subtract) a number of seconds, minutes, hours, days, weeks, months or years to an ISO date, in UTC. Month and year arithmetic clamps to the end of the month (Jan 31 + 1 month = Feb 28).",
    input: z.object({
      isoDate: iso("Starting date"),
      amount: z.number().int().describe("Units to add; negative subtracts"),
      unit: z.enum(ADD_UNITS).default("days").describe("Unit of `amount`"),
    }),
    returns: "ISO 8601 UTC timestamp",
    tags: ["date", "add", "subtract", "arithmetic", "months", "years", "hours"],
    examples: [
      {
        description: "Month-end clamp",
        input: { isoDate: "2025-01-31", amount: 1, unit: "months" },
        output: "2025-02-28T00:00:00.000Z",
      },
      {
        description: "Minus 90 minutes",
        input: { isoDate: "2025-01-01T01:00:00Z", amount: -90, unit: "minutes" },
        output: "2024-12-31T23:30:00.000Z",
      },
    ],
    run: (a) => add(a.isoDate, a.amount, a.unit),
  }),
  defineFunction({
    name: "dates/addDuration",
    description:
      "Add an ISO 8601 duration (P1Y2M3DT4H5M6S, PT30M, P2W; a leading - subtracts) to an ISO date, in UTC. Calendar parts are applied first with month-end clamping, then the time parts.",
    input: z.object({
      isoDate: iso("Starting date"),
      duration: z.string().describe("ISO 8601 duration, e.g. P1M, PT36H, -P2W"),
    }),
    returns: "ISO 8601 UTC timestamp",
    tags: ["date", "add", "duration", "iso8601", "period", "interval"],
    examples: [
      {
        description: "Mixed",
        input: { isoDate: "2025-01-31T10:00:00Z", duration: "P1MT30M" },
        output: "2025-02-28T10:30:00.000Z",
      },
      {
        description: "Negative weeks",
        input: { isoDate: "2025-01-15", duration: "-P2W" },
        output: "2025-01-01T00:00:00.000Z",
      },
    ],
    run: (a) => addDuration(a.isoDate, a.duration),
  }),
  defineFunction({
    name: "dates/startOf",
    description:
      "First instant (00:00:00.000 UTC) of the day, week (Monday start), month, quarter or year containing an ISO date.",
    input: z.object({
      isoDate: iso("Date inside the period"),
      unit: z.enum(PERIOD_UNITS).default("day").describe("Period"),
    }),
    returns: "ISO 8601 UTC timestamp",
    tags: ["date", "start", "beginning", "floor", "week", "month", "quarter", "year"],
    examples: [
      {
        description: "Week (Monday)",
        input: { isoDate: "2025-07-06T15:00:00Z", unit: "week" },
        output: "2025-06-30T00:00:00.000Z",
      },
      {
        description: "Quarter",
        input: { isoDate: "2025-08-20", unit: "quarter" },
        output: "2025-07-01T00:00:00.000Z",
      },
    ],
    run: (a) => startOf(a.isoDate, a.unit),
  }),
  defineFunction({
    name: "dates/endOf",
    description:
      "Last instant (23:59:59.999 UTC) of the day, week (ends Sunday), month, quarter or year containing an ISO date.",
    input: z.object({
      isoDate: iso("Date inside the period"),
      unit: z.enum(PERIOD_UNITS).default("day").describe("Period"),
    }),
    returns: "ISO 8601 UTC timestamp",
    tags: ["date", "end", "last", "ceil", "week", "month", "quarter", "year"],
    examples: [
      {
        description: "Month (leap February)",
        input: { isoDate: "2024-02-10", unit: "month" },
        output: "2024-02-29T23:59:59.999Z",
      },
      {
        description: "Day",
        input: { isoDate: "2025-07-04T08:00:00Z" },
        output: "2025-07-04T23:59:59.999Z",
      },
    ],
    run: (a) => endOf(a.isoDate, a.unit),
  }),
  defineFunction({
    name: "dates/info",
    description:
      "Calendar facts about an ISO date in UTC: year, month, day, weekday (0 = Sunday) and name, day of year, ISO week and week-year, quarter, leap year, weekend, days in month.",
    input: z.object({ isoDate: iso("Date to describe") }),
    returns:
      "object with iso, year, month, day, weekday, weekdayName, dayOfYear, isoWeek, isoWeekYear, quarter, isLeapYear, isWeekend, daysInMonth",
    tags: [
      "date",
      "info",
      "weekday",
      "day of week",
      "week number",
      "iso week",
      "quarter",
      "leap year",
    ],
    examples: [
      {
        description: "ISO week belongs to previous year",
        input: { isoDate: "2021-01-01" },
        output: {
          iso: "2021-01-01T00:00:00.000Z",
          year: 2021,
          month: 1,
          day: 1,
          weekday: 5,
          weekdayName: "Friday",
          dayOfYear: 1,
          isoWeek: 53,
          isoWeekYear: 2020,
          quarter: 1,
          isLeapYear: false,
          isWeekend: false,
          daysInMonth: 31,
        },
      },
    ],
    run: (a) => info(a.isoDate),
  }),
  defineFunction({
    name: "dates/toTimezone",
    description:
      "Express a UTC instant as local wall-clock time in an IANA time zone (America/New_York, Europe/Berlin, Asia/Kolkata …), DST-aware, with the numeric offset.",
    input: z.object({
      isoDate: iso("Instant to convert"),
      timeZone: z.string().describe("IANA time zone name, e.g. America/New_York"),
    }),
    returns:
      "object with iso (wall-clock with offset), offset, offsetMinutes, timeZone, abbreviation",
    tags: ["date", "timezone", "tz", "iana", "offset", "dst", "local", "convert"],
    examples: [
      {
        description: "Summer time in New York",
        input: { isoDate: "2025-07-04T12:00:00Z", timeZone: "America/New_York" },
        output: {
          iso: "2025-07-04T08:00:00.000-04:00",
          offset: "-04:00",
          offsetMinutes: -240,
          timeZone: "America/New_York",
          abbreviation: "EDT",
        },
      },
    ],
    run: (a) => toTimezone(a.isoDate, a.timeZone),
  }),
];
