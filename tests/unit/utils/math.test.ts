/**
 * Tests for math utility functions
 */

import { describe, it, expect } from "vitest";
import { round, clamp, percentage } from "../../../src/utils/math/index.js";
import type { UtilityResponse } from "../../../src/types/index.js";

function ok<T>(r: UtilityResponse<T>): T {
  expect(r.success).toBe(true);
  return (r as { success: true; result: T }).result;
}

describe("Math Utilities", () => {
  it("round to N decimals", () => {
    expect(ok(round(3.14159, 2))).toBe(3.14);
    expect(ok(round(3.7, 0))).toBe(4);
  });

  it("clamp bounds", () => {
    expect(ok(clamp(100, 0, 50))).toBe(50);
    expect(ok(clamp(-10, 0, 50))).toBe(0);
    expect(ok(clamp(25, 0, 50))).toBe(25);
  });

  it("clamp rejects inverted ranges", () => {
    expect(clamp(1, 10, 0).success).toBe(false);
  });

  it("percentage rounds to 2 places by default", () => {
    expect(ok(percentage(1, 3))).toBe(33.33);
    expect(ok(percentage(25, 100))).toBe(25);
  });

  it("percentage honors the decimals arg", () => {
    expect(ok(percentage(1, 3, 4))).toBe(33.3333);
    expect(ok(percentage(1, 3, 0))).toBe(33);
  });

  it("percentage rejects zero total", () => {
    expect(percentage(1, 0).success).toBe(false);
  });
});
