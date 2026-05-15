/**
 * Tests for validation utility functions
 */

import { describe, it, expect } from "vitest";
import {
  isEmail,
  isUrl,
  isUuid,
  isJson,
  isIsoDate,
} from "../../../src/utils/validation/index.js";
import type { UtilityResponse } from "../../../src/types/index.js";

function ok<T>(r: UtilityResponse<T>): T {
  expect(r.success).toBe(true);
  return (r as { success: true; result: T }).result;
}

describe("Validation Utilities", () => {
  it.each([
    ["user@example.com", true],
    ["a.b+c@sub.example.co.uk", true],
    ["not-an-email", false],
    ["@missing-local.com", false],
  ])("isEmail(%j) → %j", (input, expected) => {
    expect(ok(isEmail(input))).toBe(expected);
  });

  it.each([
    ["https://example.com/path?q=1", true],
    ["example.com", true],
    ["not a url", false],
  ])("isUrl(%j) → %j", (input, expected) => {
    expect(ok(isUrl(input))).toBe(expected);
  });

  it.each([
    ["550e8400-e29b-41d4-a716-446655440000", true],
    ["not-a-uuid", false],
  ])("isUuid(%j) → %j", (input, expected) => {
    expect(ok(isUuid(input))).toBe(expected);
  });

  it.each([
    ['{"a":1}', true],
    ["[1,2,3]", true],
    ['"string"', true],
    ["123", true],
    ["{bad}", false],
    ["", false],
  ])("isJson(%j) → %j", (input, expected) => {
    expect(ok(isJson(input))).toBe(expected);
  });

  it.each([
    ["2026-05-15T00:00:00Z", true],
    ["2026-05-15", true],
    ["not a date", false],
    ["2026-13-99", false],
  ])("isIsoDate(%j) → %j", (input, expected) => {
    expect(ok(isIsoDate(input))).toBe(expected);
  });
});
