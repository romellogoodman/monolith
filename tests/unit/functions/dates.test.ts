/**
 * dates/* — every assertion below must hold regardless of the host time zone.
 * The whole file runs under America/New_York (set before any import so Node
 * picks it up); `npm test` can also be run with TZ=Asia/Tokyo or TZ=UTC.
 */
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  add,
  addDays,
  addDuration,
  diff,
  diffDays,
  endOf,
  formatDate,
  fromUnix,
  functions,
  info,
  parseDate,
  parseDuration,
  parseIso,
  parseWithFormat,
  startOf,
  toTimezone,
  toUnix,
} from "../../../src/functions/dates.js";

const fn = (name: string) => {
  const found = functions.find((f) => f.name === `dates/${name}`);
  if (!found) throw new Error(`no function dates/${name}`);
  return found;
};

const expectError = (name: string, args: unknown, errorCode: string) => {
  const r = execute(fn(name), args);
  expect(r.success).toBe(false);
  expect(r).toMatchObject({ success: false, errorCode });
};

describe("host time zone", () => {
  it("is America/New_York for this suite", () => {
    expect(process.env.TZ).toBe("America/New_York");
    // EST at the epoch: local clock is five hours behind UTC.
    expect(new Date(0).getTimezoneOffset()).toBe(300);
  });
});

describe("examples reproduce", () => {
  for (const f of functions) {
    for (const ex of f.examples) {
      it(`${f.name}: ${ex.description}`, () => {
        expect(execute(f, ex.input)).toEqual({ success: true, result: ex.output });
      });
    }
  }
});

describe("timezone independence (regression)", () => {
  it("formatDate renders UTC fields, not local ones", () => {
    expect(formatDate("2025-12-11T00:00:00.000Z", "yyyy-MM-dd HH:mm")).toBe("2025-12-11 00:00");
  });
  it("addDays keeps midnight UTC", () => {
    expect(addDays("2026-05-08", 7)).toBe("2026-05-15T00:00:00.000Z");
  });
  it("addDays across the US DST boundary is exactly 24h", () => {
    expect(addDays("2025-03-08T12:00:00.000Z", 1)).toBe("2025-03-09T12:00:00.000Z");
    expect(addDays("2025-11-01T12:00:00.000Z", 1)).toBe("2025-11-02T12:00:00.000Z");
  });
  it("diffDays counts UTC calendar days", () => {
    expect(diffDays("2026-01-01T23:00:00Z", "2026-01-02T01:00:00Z")).toBe(1);
  });
  it("parseDate treats a missing offset as UTC", () => {
    expect(parseDate("2025-01-01T10:00:00")).toBe("2025-01-01T10:00:00.000Z");
  });
  it("parseDate with a format defaults omitted fields to the UTC epoch", () => {
    expect(parseDate("10:30", "HH:mm")).toBe("1970-01-01T10:30:00.000Z");
    expect(parseDate("3/4/2025", "M/d/yyyy")).toBe("2025-03-04T00:00:00.000Z");
  });
  it("parseDate rejects impossible calendar dates instead of rolling over", () => {
    expectError("parseDate", { input: "2025-02-30" }, "INVALID_DATE");
    expectError("parseDate", { input: "2025-13-01" }, "INVALID_DATE");
    expectError("parseDate", { input: "2025-01-01T24:00:00" }, "INVALID_DATE");
    expect(parseDate("2024-02-29")).toBe("2024-02-29T00:00:00.000Z");
  });
  it("parseDate tolerates surrounding whitespace", () => {
    expect(parseDate(" 2025-01-01 ")).toBe("2025-01-01T00:00:00.000Z");
  });
  it("parseDate accepts +HH:mm, +HHmm and lowercase z offsets", () => {
    expect(parseDate("2025-01-01T10:00:00+02:00")).toBe("2025-01-01T08:00:00.000Z");
    expect(parseDate("2025-01-01T10:00:00+0200")).toBe("2025-01-01T08:00:00.000Z");
    expect(parseDate("2025-01-01T10:00:00z")).toBe("2025-01-01T10:00:00.000Z");
    expect(parseDate("2025-01-01T10:00:00-05:30")).toBe("2025-01-01T15:30:00.000Z");
  });
});

describe("parseIso / parseWithFormat", () => {
  it("returns a UTCDate at the right instant", () => {
    expect(parseIso("2025-07-04T12:34:56.789Z").getTime()).toBe(
      Date.UTC(2025, 6, 4, 12, 34, 56, 789)
    );
    expect(parseIso("2025-07-04 12:34").toISOString()).toBe("2025-07-04T12:34:00.000Z");
  });
  it("truncates sub-millisecond precision", () => {
    expect(parseIso("2025-07-04T00:00:00.1234567Z").toISOString()).toBe("2025-07-04T00:00:00.123Z");
  });
  it("rejects non-ISO layouts and slashes", () => {
    expect(() => parseIso("3/4/2025")).toThrow();
    expect(() => parseIso("2025/03/04")).toThrow();
    expect(() => parseIso("")).toThrow();
  });
  it("parseWithFormat rejects input that does not match", () => {
    expect(() => parseWithFormat("2025-01-01", "dd/MM/yyyy")).toThrow();
    expectError("parseDate", { input: "2025-01-01", format: "dd/MM/yyyy" }, "INVALID_DATE");
  });
});

describe("formatDate", () => {
  it("formats with date-fns tokens in UTC", () => {
    expect(formatDate("2025-12-11T15:04:05Z", "EEEE, MMMM d, yyyy HH:mm:ss")).toBe(
      "Thursday, December 11, 2025 15:04:05"
    );
    expect(formatDate("2025-12-11T15:04:05+02:00", "HH:mm")).toBe("13:04");
  });
  it("rejects protected tokens with INVALID_FORMAT", () => {
    expectError("formatDate", { isoDate: "2025-12-11", format: "YYYY-MM-DD" }, "INVALID_FORMAT");
  });
  it("rejects an invalid date", () => {
    expectError("formatDate", { isoDate: "nope", format: "yyyy" }, "INVALID_DATE");
  });
});

describe("addDays / diffDays", () => {
  it("adds and subtracts across month and year ends", () => {
    expect(addDays("2025-12-31T10:00:00Z", 1)).toBe("2026-01-01T10:00:00.000Z");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29T00:00:00.000Z");
    expect(addDays("2025-01-01", 0)).toBe("2025-01-01T00:00:00.000Z");
  });
  it("diffDays is signed and ignores time of day", () => {
    expect(diffDays("2025-01-10", "2025-01-01")).toBe(-9);
    expect(diffDays("2025-01-01T00:00:00Z", "2025-01-01T23:59:59Z")).toBe(0);
    expect(diffDays("2024-01-01", "2025-01-01")).toBe(366);
  });
  it("rejects bad input", () => {
    expectError("addDays", { isoDate: "2025-01-01", days: 1.5 }, "INVALID_INPUT");
    expectError("addDays", { isoDate: "2025-02-30", days: 1 }, "INVALID_DATE");
    expectError("diffDays", { from: "2025-01-01", to: "bad" }, "INVALID_DATE");
  });
});

describe("toUnix", () => {
  it("returns floored seconds and exact milliseconds", () => {
    expect(toUnix("1970-01-01T00:00:00Z")).toEqual({ seconds: 0, milliseconds: 0 });
    expect(toUnix("2025-07-04T12:00:00.999Z")).toEqual({
      seconds: 1751630400,
      milliseconds: 1751630400999,
    });
    expect(toUnix("2025-07-04T14:00:00+02:00")).toEqual({
      seconds: 1751630400,
      milliseconds: 1751630400000,
    });
  });
  it("floors negative timestamps toward minus infinity", () => {
    expect(toUnix("1969-12-31T23:59:59.500Z")).toEqual({ seconds: -1, milliseconds: -500 });
  });
  it("rejects an invalid date", () => {
    expectError("toUnix", { isoDate: "2025-02-30" }, "INVALID_DATE");
  });
});

describe("fromUnix", () => {
  it("converts seconds by default and milliseconds on request", () => {
    expect(fromUnix(0)).toBe("1970-01-01T00:00:00.000Z");
    expect(fromUnix(-1)).toBe("1969-12-31T23:59:59.000Z");
    expect(fromUnix(1751630400)).toBe("2025-07-04T12:00:00.000Z");
    expect(fromUnix(1751630400123, "milliseconds")).toBe("2025-07-04T12:00:00.123Z");
  });
  it("rounds fractional input to the nearest millisecond", () => {
    expect(fromUnix(1.5)).toBe("1970-01-01T00:00:01.500Z");
    expect(fromUnix(1.0004, "milliseconds")).toBe("1970-01-01T00:00:00.001Z");
  });
  it("rejects a seconds value that looks like milliseconds", () => {
    expectError("fromUnix", { timestamp: 1751630400000 }, "AMBIGUOUS_TIMESTAMP");
    expectError("fromUnix", { timestamp: -1751630400000, unit: "seconds" }, "AMBIGUOUS_TIMESTAMP");
    expect(fromUnix(1e11)).toBe("5138-11-16T09:46:40.000Z");
  });
  it("rejects values outside the Date range and unknown units", () => {
    expectError("fromUnix", { timestamp: 1e16, unit: "milliseconds" }, "INVALID_TIMESTAMP");
    expectError("fromUnix", { timestamp: 1, unit: "minutes" }, "INVALID_INPUT");
    expectError("fromUnix", { timestamp: "1" }, "INVALID_INPUT");
  });
});

describe("diff", () => {
  it("defaults to calendar days", () => {
    expect(diff("2026-01-01T23:00:00Z", "2026-01-02T01:00:00Z")).toBe(1);
    expect(diff("2025-01-10", "2025-01-01")).toBe(-9);
  });
  it("time units are exact and may be fractional", () => {
    expect(diff("2025-01-01T00:00:00Z", "2025-01-01T00:00:01.250Z", "milliseconds")).toBe(1250);
    expect(diff("2025-01-01T00:00:00Z", "2025-01-01T00:00:01.250Z", "seconds")).toBe(1.25);
    expect(diff("2025-01-01T00:00:00Z", "2025-01-01T00:45:00Z", "minutes")).toBe(45);
    expect(diff("2025-01-01T00:00:00Z", "2025-01-02T12:00:00Z", "hours")).toBe(36);
    expect(diff("2025-01-02T00:00:00Z", "2025-01-01T00:00:00Z", "hours")).toBe(-24);
  });
  it("weeks count Monday boundaries crossed", () => {
    expect(diff("2025-01-12", "2025-01-13", "weeks")).toBe(1); // Sunday → Monday
    expect(diff("2025-01-13", "2025-01-19", "weeks")).toBe(0); // Monday → Sunday of same week
    expect(diff("2025-01-13", "2025-01-06", "weeks")).toBe(-1);
  });
  it("months and years count calendar boundaries crossed", () => {
    expect(diff("2025-01-31", "2025-02-01", "months")).toBe(1);
    expect(diff("2025-01-01", "2025-01-31", "months")).toBe(0);
    expect(diff("2024-12-31T23:59:59Z", "2025-01-01T00:00:00Z", "years")).toBe(1);
    expect(diff("2025-06-01", "2023-06-01", "years")).toBe(-2);
  });
  it("rejects bad units and dates", () => {
    expectError(
      "diff",
      { from: "2025-01-01", to: "2025-01-02", unit: "fortnights" },
      "INVALID_INPUT"
    );
    expectError("diff", { from: "2025-01-01", to: "2025-02-30" }, "INVALID_DATE");
  });
});

describe("add", () => {
  it("defaults to days", () => {
    expect(add("2025-12-31", 1)).toBe("2026-01-01T00:00:00.000Z");
  });
  it("handles each unit", () => {
    expect(add("2025-01-01T00:00:00Z", 90, "seconds")).toBe("2025-01-01T00:01:30.000Z");
    expect(add("2025-01-01T00:00:00Z", -90, "minutes")).toBe("2024-12-31T22:30:00.000Z");
    expect(add("2025-03-08T12:00:00Z", 36, "hours")).toBe("2025-03-10T00:00:00.000Z");
    expect(add("2025-01-01", 2, "weeks")).toBe("2025-01-15T00:00:00.000Z");
    expect(add("2025-01-31", 1, "months")).toBe("2025-02-28T00:00:00.000Z");
    expect(add("2024-02-29", 1, "years")).toBe("2025-02-28T00:00:00.000Z");
    expect(add("2025-03-31", -1, "months")).toBe("2025-02-28T00:00:00.000Z");
  });
  it("rejects non-integer amounts and unsupported units", () => {
    expectError("add", { isoDate: "2025-01-01", amount: 1.5 }, "INVALID_INPUT");
    expectError("add", { isoDate: "2025-01-01", amount: 1, unit: "milliseconds" }, "INVALID_INPUT");
    expectError("add", { isoDate: "2025-02-30", amount: 1 }, "INVALID_DATE");
  });
});

describe("parseDuration / addDuration", () => {
  it("parses every component", () => {
    expect(parseDuration("P1Y2M3W4DT5H6M7.5S")).toEqual({
      years: 1,
      months: 2,
      weeks: 3,
      days: 4,
      hours: 5,
      minutes: 6,
      seconds: 7.5,
    });
    expect(parseDuration("-PT30M")).toMatchObject({ minutes: -30, hours: 0, days: 0 });
    expect(parseDuration(" p2w ")).toMatchObject({ weeks: 2 });
  });
  it("adds durations in UTC, calendar parts first", () => {
    expect(addDuration("2020-01-01T00:00:00Z", "P1Y2M3DT4H5M6S")).toBe("2021-03-04T04:05:06.000Z");
    expect(addDuration("2025-01-01", "PT36H")).toBe("2025-01-02T12:00:00.000Z");
    expect(addDuration("2025-01-01", "PT1.5S")).toBe("2025-01-01T00:00:01.500Z");
    expect(addDuration("2025-01-02", "-P1D")).toBe("2025-01-01T00:00:00.000Z");
    expect(addDuration("2025-01-31", "P1MT24H")).toBe("2025-03-01T00:00:00.000Z");
    expect(addDuration("2025-03-08T12:00:00Z", "P1D")).toBe("2025-03-09T12:00:00.000Z");
  });
  it("rejects malformed durations with INVALID_DURATION", () => {
    for (const duration of [
      "",
      "P",
      "PT",
      "-P",
      "1D",
      "P1S",
      "P1.5D",
      "P1DT",
      "PT1H1D",
      "1Y",
      "P-1D",
    ]) {
      expectError("addDuration", { isoDate: "2025-01-01", duration }, "INVALID_DURATION");
    }
  });
  it("rejects an invalid date", () => {
    expectError("addDuration", { isoDate: "2025-02-30", duration: "P1D" }, "INVALID_DATE");
  });
});

describe("startOf / endOf", () => {
  const wednesday = "2025-07-02T15:30:45.123Z";
  it("day is the default", () => {
    expect(startOf(wednesday)).toBe("2025-07-02T00:00:00.000Z");
    expect(endOf(wednesday)).toBe("2025-07-02T23:59:59.999Z");
  });
  it("weeks run Monday to Sunday", () => {
    expect(startOf(wednesday, "week")).toBe("2025-06-30T00:00:00.000Z");
    expect(endOf(wednesday, "week")).toBe("2025-07-06T23:59:59.999Z");
    expect(startOf("2025-06-30", "week")).toBe("2025-06-30T00:00:00.000Z"); // a Monday
    expect(startOf("2025-07-06T23:00:00Z", "week")).toBe("2025-06-30T00:00:00.000Z"); // a Sunday
    expect(endOf("2025-07-06", "week")).toBe("2025-07-06T23:59:59.999Z");
  });
  it("month, quarter and year", () => {
    expect(startOf(wednesday, "month")).toBe("2025-07-01T00:00:00.000Z");
    expect(endOf(wednesday, "month")).toBe("2025-07-31T23:59:59.999Z");
    expect(startOf(wednesday, "quarter")).toBe("2025-07-01T00:00:00.000Z");
    expect(endOf("2025-11-15", "quarter")).toBe("2025-12-31T23:59:59.999Z");
    expect(startOf(wednesday, "year")).toBe("2025-01-01T00:00:00.000Z");
    expect(endOf(wednesday, "year")).toBe("2025-12-31T23:59:59.999Z");
    expect(endOf("2024-02-01", "month")).toBe("2024-02-29T23:59:59.999Z");
  });
  it("rejects unknown units and bad dates", () => {
    expectError("startOf", { isoDate: wednesday, unit: "hour" }, "INVALID_INPUT");
    expectError("endOf", { isoDate: wednesday, unit: "decade" }, "INVALID_INPUT");
    expectError("startOf", { isoDate: "2025-02-30" }, "INVALID_DATE");
    expectError("endOf", { isoDate: "2025-02-30" }, "INVALID_DATE");
  });
});

describe("info", () => {
  it("describes a leap-day Saturday", () => {
    expect(info("2020-02-29T23:30:00Z")).toEqual({
      iso: "2020-02-29T23:30:00.000Z",
      year: 2020,
      month: 2,
      day: 29,
      weekday: 6,
      weekdayName: "Saturday",
      dayOfYear: 60,
      isoWeek: 9,
      isoWeekYear: 2020,
      quarter: 1,
      isLeapYear: true,
      isWeekend: true,
      daysInMonth: 29,
    });
  });
  it("ISO week 1 can start in the previous year", () => {
    expect(info("2024-12-30")).toMatchObject({
      year: 2024,
      isoWeek: 1,
      isoWeekYear: 2025,
      weekday: 1,
    });
    expect(info("2021-01-03")).toMatchObject({ isoWeek: 53, isoWeekYear: 2020, isWeekend: true });
  });
  it("uses UTC fields even when local time would be a different day", () => {
    expect(info("2025-07-05T02:00:00Z")).toMatchObject({ day: 5, weekdayName: "Saturday" });
    expect(info("2025-12-31T23:59:59Z")).toMatchObject({ dayOfYear: 365, quarter: 4, day: 31 });
  });
  it("rejects an invalid date", () => {
    expectError("info", { isoDate: "2025-02-30" }, "INVALID_DATE");
  });
});

describe("toTimezone", () => {
  it("applies DST-aware offsets", () => {
    expect(toTimezone("2025-01-15T12:00:00Z", "America/New_York")).toEqual({
      iso: "2025-01-15T07:00:00.000-05:00",
      offset: "-05:00",
      offsetMinutes: -300,
      timeZone: "America/New_York",
      abbreviation: "EST",
    });
    expect(toTimezone("2025-03-09T06:59:59Z", "America/New_York").iso).toBe(
      "2025-03-09T01:59:59.000-05:00"
    );
    expect(toTimezone("2025-03-09T07:00:00Z", "America/New_York").iso).toBe(
      "2025-03-09T03:00:00.000-04:00"
    );
  });
  it("handles half-hour and positive offsets", () => {
    expect(toTimezone("2025-07-04T12:00:00Z", "Asia/Kolkata")).toMatchObject({
      iso: "2025-07-04T17:30:00.000+05:30",
      offset: "+05:30",
      offsetMinutes: 330,
    });
    expect(toTimezone("2025-12-31T20:00:00Z", "Asia/Tokyo")).toMatchObject({
      iso: "2026-01-01T05:00:00.000+09:00",
      offsetMinutes: 540,
    });
    expect(toTimezone("2025-07-04T12:00:00Z", "UTC")).toMatchObject({
      iso: "2025-07-04T12:00:00.000+00:00",
      offset: "+00:00",
      offsetMinutes: 0,
      abbreviation: "UTC",
    });
  });
  it("accepts an input with its own offset", () => {
    expect(toTimezone("2025-07-04T14:00:00+02:00", "Europe/London").iso).toBe(
      "2025-07-04T13:00:00.000+01:00"
    );
  });
  it("rejects unknown zones with INVALID_TIMEZONE", () => {
    expectError(
      "toTimezone",
      { isoDate: "2025-07-04", timeZone: "Mars/Olympus" },
      "INVALID_TIMEZONE"
    );
    expectError("toTimezone", { isoDate: "2025-07-04", timeZone: "" }, "INVALID_TIMEZONE");
    expectError("toTimezone", { isoDate: "2025-02-30", timeZone: "UTC" }, "INVALID_DATE");
  });
});
