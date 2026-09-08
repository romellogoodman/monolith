/**
 * validation/* — boolean checks. These never throw: a malformed input is
 * simply `false`.
 */

import { z } from "zod";
import validator from "validator";
import { isIP } from "node:net";
import semver from "semver";
import { defineFunction } from "../core/define.js";

export const isEmail = (input: string): boolean => validator.isEmail(input);
export const isUrl = (input: string): boolean => validator.isURL(input);
export const isUuid = (input: string): boolean => validator.isUUID(input);
export const isIsoDate = (input: string): boolean => validator.isISO8601(input, { strict: true });
export const isHexColor = (input: string): boolean =>
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(input);
export const isSemver = (input: string): boolean => semver.valid(input) !== null;
export const isBase64 = (input: string): boolean =>
  /^[A-Za-z0-9+/]*={0,2}$/.test(input) && input.length % 4 === 0;

export function isJson(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}

/** 4 → IPv4, 6 → IPv6, 0 → not an IP address. */
export const ipVersion = (input: string): 0 | 4 | 6 => isIP(input) as 0 | 4 | 6;

function check(
  suffix: string,
  description: string,
  run: (input: string) => boolean,
  examples: Array<[string, boolean]>,
  tags: string[]
) {
  return defineFunction({
    name: `validation/${suffix}`,
    description,
    input: z.object({ input: z.string().describe("String to check") }),
    returns: "true when the input is valid, otherwise false",
    tags: ["validation", "check", ...tags],
    examples: examples.map(([input, output]) => ({
      description: output ? "Valid" : "Invalid",
      input: { input },
      output,
    })),
    run: (a) => run(a.input),
  });
}

export const functions = [
  check(
    "isEmail",
    "Check whether text is a syntactically valid email address (RFC 5322 shape; does not verify the mailbox exists).",
    isEmail,
    [
      ["user@example.com", true],
      ["not-an-email", false],
    ],
    ["email"]
  ),
  check(
    "isUrl",
    "Check whether text is a valid absolute URL with a host (http/https/ftp by default).",
    isUrl,
    [
      ["https://example.com/path?q=1", true],
      ["example", false],
    ],
    ["url", "link"]
  ),
  check(
    "isUuid",
    "Check whether text is a UUID (any version, hyphenated, case-insensitive).",
    isUuid,
    [
      ["550e8400-e29b-41d4-a716-446655440000", true],
      ["550e8400", false],
    ],
    ["uuid", "guid"]
  ),
  check(
    "isJson",
    "Check whether text parses as JSON (any JSON value, not only objects).",
    isJson,
    [
      ['{"a":1}', true],
      ["{bad}", false],
    ],
    ["json", "parse"]
  ),
  check(
    "isIsoDate",
    "Check whether text is a valid ISO 8601 date or date-time (strict: rejects impossible dates such as Feb 30).",
    isIsoDate,
    [
      ["2026-05-15T00:00:00Z", true],
      ["2026-02-30", false],
    ],
    ["date", "iso8601"]
  ),
  check(
    "isHexColor",
    "Check whether text is a CSS hex color: #rgb, #rgba, #rrggbb, or #rrggbbaa.",
    isHexColor,
    [
      ["#ff8800", true],
      ["ff8800", false],
    ],
    ["color", "hex", "css"]
  ),
  check(
    "isSemver",
    "Check whether text is a valid semantic version (e.g. 1.2.3, 2.0.0-beta.1+build.5).",
    isSemver,
    [
      ["1.2.3-beta.1", true],
      ["1.2", false],
    ],
    ["semver", "version"]
  ),
  check(
    "isBase64",
    "Check whether text is standard base64 (A–Z a–z 0–9 + / with = padding, length a multiple of 4).",
    isBase64,
    [
      ["SGVsbG8=", true],
      ["SGVsbG8", false],
    ],
    ["base64", "encoding"]
  ),
  defineFunction({
    name: "validation/isIpAddress",
    description:
      "Detect whether text is an IP address and which version. Returns 4, 6, or 0 when it is not an IP.",
    input: z.object({ input: z.string().describe("String to check") }),
    returns: "4 for IPv4, 6 for IPv6, 0 otherwise",
    tags: ["validation", "check", "ip", "ipv4", "ipv6", "network"],
    examples: [
      { description: "IPv4", input: { input: "192.168.0.1" }, output: 4 },
      { description: "IPv6", input: { input: "::1" }, output: 6 },
      { description: "Not an IP", input: { input: "example.com" }, output: 0 },
    ],
    run: (a) => ipVersion(a.input),
  }),
];
