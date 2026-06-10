/**
 * Tests for date utility functions
 */

import { describe, it, expect } from "vitest";
import { parseDate, formatDate, addDays, diffDays } from "../../../src/utils/dates/index.js";
import type { UtilityResponse } from "../../../src/types/index.js";

function ok<T>(r: UtilityResponse<T>): T {
  expect(r.success).toBe(true);
  return (r as { success: true; result: T }).result;
}

describe("Date Utilities", () => {
  it("parseDate normalizes to ISO 8601", () => {
    expect(ok(parseDate("2025-12-11"))).toBe("2025-12-11T00:00:00.000Z");
  });

  it("parseDate rejects ambiguous non-ISO input without a format", () => {
    const r = parseDate("3/4/2025");
    expect(r.success).toBe(false);
    expect((r as { success: false; errorCode: string }).errorCode).toBe("INVALID_DATE");
  });

  it("parseDate with a format is timezone-independent", () => {
    expect(ok(parseDate("3/4/2025", "M/d/yyyy"))).toBe("2025-03-04T00:00:00.000Z");
  });

  it("formatDate applies a pattern", () => {
    expect(ok(formatDate("2025-12-11T00:00:00.000Z", "yyyy"))).toBe("2025");
  });

  it("addDays shifts forward and back", () => {
    expect(ok(addDays("2026-05-08T00:00:00.000Z", 7))).toBe("2026-05-15T00:00:00.000Z");
    expect(ok(addDays("2026-05-08T00:00:00.000Z", -7))).toBe("2026-05-01T00:00:00.000Z");
  });

  it("diffDays counts calendar days (positive and negative)", () => {
    expect(ok(diffDays("2026-01-01", "2026-01-08"))).toBe(7);
    expect(ok(diffDays("2026-01-08", "2026-01-01"))).toBe(-7);
    expect(ok(diffDays("2026-01-01", "2026-01-01"))).toBe(0);
  });

  it("diffDays rejects invalid dates as an error envelope", () => {
    expect(diffDays("nope", "2026-01-01").success).toBe(false);
  });
});
