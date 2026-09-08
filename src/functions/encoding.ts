/**
 * encoding/* — text encodings, digests, and identifiers. Decoders validate
 * their input and reject invalid UTF-8 rather than emitting U+FFFD.
 */

import { z } from "zod";
import { createHash, createHmac } from "node:crypto";
import { crc32 as zlibCrc32 } from "node:zlib";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

const text = (description: string) => z.string().describe(description);
const utf8 = new TextDecoder("utf-8", { fatal: true });

function decodeUtf8(bytes: Buffer, what: string): string {
  try {
    return utf8.decode(bytes);
  } catch {
    return fail("DECODING_ERROR", `${what} decodes to bytes that are not valid UTF-8`);
  }
}

export const base64Encode = (input: string): string =>
  Buffer.from(input, "utf-8").toString("base64");
export const base64UrlEncode = (input: string): string =>
  Buffer.from(input, "utf-8").toString("base64url");

/** Decode standard or URL-safe base64. Whitespace (line wraps) is ignored; padding is optional. */
export function base64Decode(input: string): string {
  const compact = input.replace(/\s+/g, "");
  const body = compact.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/_-]*$/.test(body) || body.length % 4 === 1) {
    fail("DECODING_ERROR", "Input is not a valid base64 string");
  }
  return decodeUtf8(Buffer.from(body, "base64"), "base64 input");
}

export const urlEncode = (input: string): string => encodeURIComponent(input);
export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return fail("DECODING_ERROR", "Input contains a malformed percent-escape");
  }
}

export const hexEncode = (input: string): string => Buffer.from(input, "utf-8").toString("hex");
export function hexDecode(input: string): string {
  if (!/^[0-9a-fA-F]*$/.test(input) || input.length % 2 !== 0) {
    fail("DECODING_ERROR", "Input is not a valid hex string (even count of 0-9a-f)");
  }
  return decodeUtf8(Buffer.from(input, "hex"), "hex input");
}

const digest = (algorithm: string) => (input: string) =>
  createHash(algorithm).update(input, "utf-8").digest("hex");
export const hashSha256 = digest("sha256");
export const hashSha1 = digest("sha1");
export const hashSha512 = digest("sha512");
export const hashMd5 = digest("md5");

export const hmacSha256 = (input: string, key: string): string =>
  createHmac("sha256", key).update(input, "utf-8").digest("hex");

export const crc32 = (input: string): string =>
  zlibCrc32(Buffer.from(input, "utf-8")).toString(16).padStart(8, "0");

/** RFC 4122 name-based UUID (version 5, SHA-1). Same namespace + name always yields the same UUID. */
export function uuidV5(name: string, namespace: string): string {
  const hex = namespace.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) fail("INVALID_INPUT", "namespace must be a UUID");
  const hash = createHash("sha1")
    .update(Buffer.from(hex, "hex"))
    .update(Buffer.from(name, "utf-8"))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export const UUID_NAMESPACES = {
  dns: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  url: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  oid: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  x500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
} as const;

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  /** `exp`/`iat`/`nbf` claims rendered as ISO 8601, when present. */
  times: Partial<Record<"exp" | "iat" | "nbf", string>>;
}

/** Decode (without verifying) a JSON Web Token into header, payload, and signature. */
export function jwtDecode(token: string): DecodedJwt {
  const parts = token.trim().split(".");
  if (parts.length !== 3) fail("INVALID_JWT", "A JWT has three dot-separated parts");
  const section = (part: string, label: string): Record<string, unknown> => {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf-8"));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      return parsed as Record<string, unknown>;
    } catch {
      return fail("INVALID_JWT", `JWT ${label} is not base64url-encoded JSON`);
    }
  };
  const header = section(parts[0], "header");
  const payload = section(parts[1], "payload");
  const times: DecodedJwt["times"] = {};
  for (const claim of ["exp", "iat", "nbf"] as const) {
    const v = payload[claim];
    if (typeof v === "number" && Number.isFinite(v))
      times[claim] = new Date(v * 1000).toISOString();
  }
  return { header, payload, signature: parts[2], times };
}

function codec(
  suffix: string,
  description: string,
  run: (input: string) => string,
  examples: Array<[string, string]>,
  tags: string[],
  inputDescription = "Text to encode"
) {
  return defineFunction({
    name: `encoding/${suffix}`,
    description,
    input: z.object({ input: text(inputDescription) }),
    returns: "encoded or decoded string",
    tags: ["encoding", ...tags],
    examples: examples.map(([input, output]) => ({
      description: JSON.stringify(input),
      input: { input },
      output,
    })),
    run: (a) => run(a.input),
  });
}

export const functions = [
  codec(
    "base64Encode",
    "Encode UTF-8 text as standard base64 (+ / with = padding).",
    base64Encode,
    [["Hello World", "SGVsbG8gV29ybGQ="]],
    ["base64", "encode"]
  ),
  codec(
    "base64Decode",
    "Decode base64 (standard or URL-safe alphabet, padding optional, whitespace ignored) to UTF-8 text.",
    base64Decode,
    [["SGVsbG8gV29ybGQ=", "Hello World"]],
    ["base64", "decode"],
    "Base64 text to decode"
  ),
  codec(
    "base64UrlEncode",
    "Encode UTF-8 text as URL-safe base64 (- _ alphabet, no padding) as used in JWTs and PKCE.",
    base64UrlEncode,
    [["hi?>", "aGk_Pg"]],
    ["base64", "base64url", "encode", "jwt"]
  ),
  codec(
    "urlEncode",
    "Percent-encode text for use inside a URL component (encodeURIComponent).",
    urlEncode,
    [["a b/c", "a%20b%2Fc"]],
    ["url", "uri", "percent", "encode"]
  ),
  codec(
    "urlDecode",
    "Decode a percent-encoded URL component. Note `+` is not treated as a space.",
    urlDecode,
    [["a%20b%2Fc", "a b/c"]],
    ["url", "uri", "percent", "decode"],
    "Percent-encoded text"
  ),
  codec(
    "hexEncode",
    "Encode UTF-8 text as lowercase hexadecimal.",
    hexEncode,
    [["hi", "6869"]],
    ["hex", "encode"]
  ),
  codec(
    "hexDecode",
    "Decode hexadecimal to UTF-8 text.",
    hexDecode,
    [["6869", "hi"]],
    ["hex", "decode"],
    "Hex text to decode"
  ),
  codec(
    "hashSha256",
    "SHA-256 digest of UTF-8 text as 64 lowercase hex characters.",
    hashSha256,
    [["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"]],
    ["hash", "sha256", "digest", "checksum"],
    "Text to hash"
  ),
  codec(
    "hashSha1",
    "SHA-1 digest of UTF-8 text as 40 lowercase hex characters (git object ids, legacy checksums; not for security).",
    hashSha1,
    [["abc", "a9993e364706816aba3e25717850c26c9cd0d89d"]],
    ["hash", "sha1", "digest", "checksum"],
    "Text to hash"
  ),
  codec(
    "hashSha512",
    "SHA-512 digest of UTF-8 text as 128 lowercase hex characters.",
    hashSha512,
    [
      [
        "abc",
        "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
      ],
    ],
    ["hash", "sha512", "digest", "checksum"],
    "Text to hash"
  ),
  codec(
    "hashMd5",
    "MD5 digest of UTF-8 text as 32 lowercase hex characters (cache keys and legacy checksums; not for security).",
    hashMd5,
    [["", "d41d8cd98f00b204e9800998ecf8427e"]],
    ["hash", "md5", "digest", "checksum"],
    "Text to hash"
  ),
  codec(
    "crc32",
    "CRC-32 checksum of UTF-8 text as 8 lowercase hex characters (zip/png polynomial).",
    crc32,
    [["hello", "3610a686"]],
    ["hash", "crc32", "checksum"],
    "Text to checksum"
  ),
  defineFunction({
    name: "encoding/hmacSha256",
    description:
      "HMAC-SHA256 of UTF-8 text with a UTF-8 secret key, as 64 lowercase hex characters (webhook signatures, API auth).",
    input: z.object({ input: text("Message to sign"), key: text("Secret key") }),
    returns: "64-character hex MAC",
    tags: ["encoding", "hmac", "sha256", "signature", "mac"],
    examples: [
      {
        description: "Simple",
        input: { input: "message", key: "secret" },
        output: "8b5f48702995c1598c573db1e21866a9b825d4a794d169d7060a03605796360b",
      },
    ],
    run: (a) => hmacSha256(a.input, a.key),
  }),
  defineFunction({
    name: "encoding/base64UrlDecode",
    description:
      "Decode URL-safe base64 (padding optional) to UTF-8 text. Alias of base64Decode that documents the JWT/PKCE use case.",
    input: z.object({ input: text("Base64url text to decode") }),
    returns: "decoded UTF-8 text",
    tags: ["encoding", "base64", "base64url", "decode", "jwt"],
    examples: [{ description: "Unpadded", input: { input: "aGk_Pg" }, output: "hi?>" }],
    run: (a) => base64Decode(a.input),
  }),
  defineFunction({
    name: "encoding/uuidV5",
    description:
      "Deterministic name-based UUID (version 5). The same namespace and name always produce the same id. Namespace may be a UUID or one of the RFC 4122 names dns, url, oid, x500.",
    input: z.object({
      name: text("Name to derive the UUID from"),
      namespace: text("Namespace UUID, or dns | url | oid | x500").default("dns"),
    }),
    returns: "lowercase hyphenated UUID",
    tags: ["encoding", "uuid", "id", "deterministic", "sha1"],
    examples: [
      {
        description: "DNS namespace",
        input: { name: "example.com", namespace: "dns" },
        output: "cfbff0d1-9375-5685-968c-48ce8b15ae17",
      },
    ],
    run: (a) => {
      const ns = (UUID_NAMESPACES as Record<string, string>)[a.namespace] ?? a.namespace;
      return uuidV5(a.name, ns);
    },
  }),
  defineFunction({
    name: "encoding/jwtDecode",
    description:
      "Decode a JSON Web Token into header, payload, and signature WITHOUT verifying it. Timestamp claims (exp, iat, nbf) are also returned as ISO 8601.",
    input: z.object({ token: text("JWT string (header.payload.signature)") }),
    returns: "object with header, payload, signature, and times",
    tags: ["encoding", "jwt", "token", "decode", "auth"],
    examples: [
      {
        description: "Unsigned example token",
        input: {
          token:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyfQ.sig",
        },
        output: {
          header: { alg: "HS256", typ: "JWT" },
          payload: { sub: "1234567890", iat: 1516239022 },
          signature: "sig",
          times: { iat: "2018-01-18T01:30:22.000Z" },
        },
      },
    ],
    run: (a) => jwtDecode(a.token),
  }),
];
