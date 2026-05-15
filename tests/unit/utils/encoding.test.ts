/**
 * Tests for encoding utility functions
 */

import { describe, it, expect } from "vitest";
import {
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  hexEncode,
  hexDecode,
  hashSha256,
  hashMd5,
} from "../../../src/utils/encoding/index.js";
import type { UtilityResponse } from "../../../src/types/index.js";

function ok<T>(r: UtilityResponse<T>): T {
  expect(r.success).toBe(true);
  return (r as { success: true; result: T }).result;
}

describe("Encoding Utilities", () => {
  it("base64 round-trips", () => {
    expect(ok(base64Decode(ok(base64Encode("Hello World"))))).toBe("Hello World");
  });

  it("urlEncode percent-encodes reserved characters", () => {
    expect(ok(urlEncode("a b/c?d=1"))).toBe("a%20b%2Fc%3Fd%3D1");
  });

  it("url round-trips", () => {
    const s = "a b/c?d=1&e=#f";
    expect(ok(urlDecode(ok(urlEncode(s))))).toBe(s);
  });

  it("urlDecode rejects malformed percent-escapes as an error envelope", () => {
    expect(urlDecode("%zz").success).toBe(false);
  });

  it("hexEncode produces lowercase hex", () => {
    expect(ok(hexEncode("hi"))).toBe("6869");
  });

  it("hex round-trips utf-8", () => {
    const s = "héllo";
    expect(ok(hexDecode(ok(hexEncode(s))))).toBe(s);
  });

  it("hexDecode rejects non-hex and odd-length input", () => {
    expect(hexDecode("xyz").success).toBe(false);
    expect(hexDecode("abc").success).toBe(false);
  });

  it("hashSha256 matches the known empty-string digest", () => {
    expect(ok(hashSha256(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("hashSha256 is deterministic", () => {
    expect(ok(hashSha256("monolith"))).toBe(ok(hashSha256("monolith")));
  });

  it("hashMd5 matches the known empty-string digest", () => {
    expect(ok(hashMd5(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });
});
