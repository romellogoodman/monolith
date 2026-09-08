import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  functions,
  ipVersion,
  isBase64,
  isEmail,
  isHexColor,
  isIsoDate,
  isJson,
  isSemver,
  isUrl,
  isUuid,
} from "../../../src/functions/validation.js";

describe("examples reproduce", () => {
  for (const f of functions) {
    for (const ex of f.examples) {
      it(`${f.name}: ${ex.description} ${JSON.stringify(ex.input)}`, () => {
        expect(execute(f, ex.input)).toEqual({ success: true, result: ex.output });
      });
    }
  }
});

describe("schema validation is the only failure mode", () => {
  for (const f of functions) {
    it(`${f.name} rejects a non-string input with INVALID_INPUT`, () => {
      expect(execute(f, { input: 123 })).toMatchObject({
        success: false,
        errorCode: "INVALID_INPUT",
      });
      expect(execute(f, {})).toMatchObject({ success: false, errorCode: "INVALID_INPUT" });
    });
  }
});

describe("isEmail", () => {
  it.each([
    ["user@example.com", true],
    ["first.last+tag@sub.example.co.uk", true],
    ["not-an-email", false],
    ["user@", false],
    ["@example.com", false],
    ["user@localhost", false],
    ["", false],
  ])("%s → %s", (input, expected) => {
    expect(isEmail(input)).toBe(expected);
  });
});

describe("isUrl", () => {
  it.each([
    ["https://example.com/path?q=1#frag", true],
    ["http://example.com", true],
    ["ftp://files.example.com/x", true],
    ["example.com", true],
    ["example", false],
    // validator's defaults require a TLD, so bare hosts are rejected.
    ["localhost", false],
    ["http://localhost", false],
    ["javascript:alert(1)", false],
    ["mailto:user@example.com", false],
    ["", false],
  ])("%s → %s", (input, expected) => {
    expect(isUrl(input)).toBe(expected);
  });
});

describe("isUuid", () => {
  it.each([
    ["550e8400-e29b-41d4-a716-446655440000", true],
    ["550E8400-E29B-41D4-A716-446655440000", true],
    ["00000000-0000-0000-0000-000000000000", true],
    ["cfbff0d1-9375-5685-968c-48ce8b15ae17", true],
    ["550e8400e29b41d4a716446655440000", false],
    ["550e8400", false],
    ["550e8400-e29b-41d4-a716-44665544000g", false],
  ])("%s → %s", (input, expected) => {
    expect(isUuid(input)).toBe(expected);
  });
});

describe("isJson", () => {
  it.each([
    ['{"a":1}', true],
    ["[1,2]", true],
    ["42", true],
    ['"str"', true],
    ["null", true],
    ["{bad}", false],
    ["{'a':1}", false],
    ["", false],
    ["undefined", false],
  ])("%s → %s", (input, expected) => {
    expect(isJson(input)).toBe(expected);
  });
});

describe("isIsoDate", () => {
  it.each([
    ["2026-05-15T00:00:00Z", true],
    ["2026-05-15", true],
    ["2026-05-15T10:20:30.123+02:00", true],
    // validator accepts the ISO 8601 basic (no separators) form.
    ["20260101", true],
    ["2026-02-30", false],
    ["2025-02-29", false],
    ["2024-02-29", true],
    ["15/05/2026", false],
    ["2026-13-01", false],
    ["", false],
  ])("%s → %s", (input, expected) => {
    expect(isIsoDate(input)).toBe(expected);
  });
});

describe("isHexColor", () => {
  it.each([
    ["#abc", true],
    ["#abcd", true],
    ["#aabbcc", true],
    ["#aabbccdd", true],
    ["#ABCDEF", true],
    ["#abcde", false],
    ["#ab", false],
    ["#aabbccddee", false],
    ["abc", false],
    ["#ggg", false],
    ["#", false],
  ])("%s → %s", (input, expected) => {
    expect(isHexColor(input)).toBe(expected);
  });
});

describe("isSemver", () => {
  it.each([
    ["1.2.3", true],
    ["0.0.0", true],
    ["2.0.0-beta.1+build.5", true],
    // semver.valid() tolerates a leading v and surrounding whitespace.
    ["v1.2.3", true],
    ["1.2", false],
    ["1", false],
    ["1.2.3.4", false],
    ["01.2.3", false],
    ["latest", false],
    ["", false],
  ])("%s → %s", (input, expected) => {
    expect(isSemver(input)).toBe(expected);
  });
});

describe("isBase64", () => {
  it.each([
    ["SGVsbG8=", true],
    ["SGVsbG8gV29ybGQ=", true],
    ["YQ==", true],
    ["YWJj", true],
    ["", true],
    ["SGVsbG8", false],
    ["YQ===", false],
    ["SGVs=bG8=", false],
    ["aGk_Pg==", false],
    ["SGVsbG8=\n", false],
  ])("%j → %s", (input, expected) => {
    expect(isBase64(input)).toBe(expected);
  });
});

describe("isIpAddress", () => {
  it.each([
    ["1.2.3.4", 4],
    ["192.168.0.1", 4],
    ["::1", 6],
    ["2001:db8::ff00:42:8329", 6],
    ["::ffff:1.2.3.4", 6],
    ["1.2.3.256", 0],
    ["1.2.3", 0],
    ["example.com", 0],
    ["", 0],
    ["1.2.3.4:80", 0],
  ])("%s → %s", (input, expected) => {
    expect(ipVersion(input)).toBe(expected);
  });
});
