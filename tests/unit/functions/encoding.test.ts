import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  UUID_NAMESPACES,
  base64Decode,
  base64Encode,
  base64UrlEncode,
  crc32,
  functions,
  hashMd5,
  hashSha1,
  hashSha256,
  hashSha512,
  hexDecode,
  hexEncode,
  hmacSha256,
  jwtDecode,
  urlDecode,
  urlEncode,
  uuidV5,
} from "../../../src/functions/encoding.js";

const fn = (name: string) => {
  const found = functions.find((f) => f.name === `encoding/${name}`);
  if (!found) throw new Error(`no function encoding/${name}`);
  return found;
};

const expectError = (name: string, args: unknown, errorCode: string) => {
  expect(execute(fn(name), args)).toMatchObject({ success: false, errorCode });
};

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("examples reproduce", () => {
  for (const f of functions) {
    for (const ex of f.examples) {
      it(`${f.name}: ${ex.description}`, () => {
        expect(execute(f, ex.input)).toEqual({ success: true, result: ex.output });
      });
    }
  }
});

describe("base64", () => {
  it("encodes standard and URL-safe alphabets", () => {
    expect(base64Encode("Hello World")).toBe("SGVsbG8gV29ybGQ=");
    expect(base64Encode("")).toBe("");
    expect(base64Encode("hi?>")).toBe("aGk/Pg==");
    expect(base64UrlEncode("hi?>")).toBe("aGk_Pg");
    expect(base64Encode("héllo")).toBe("aMOpbGxv");
  });
  it("decodes with embedded whitespace, without padding, and URL-safe input", () => {
    expect(base64Decode("SGVs\nbG8=")).toBe("Hello");
    expect(base64Decode("SGVs bG8g\r\nV29ybGQ=")).toBe("Hello World");
    expect(base64Decode("SGVsbG8")).toBe("Hello");
    expect(base64Decode("aGk_Pg")).toBe("hi?>");
    expect(base64Decode("aGk_Pg==")).toBe("hi?>");
    expect(base64Decode("")).toBe("");
    expect(base64Decode(base64Encode("héllo €"))).toBe("héllo €");
  });
  it("base64UrlDecode shares the decoder", () => {
    expect(execute(fn("base64UrlDecode"), { input: "SGVsbG8=" })).toEqual({
      success: true,
      result: "Hello",
    });
  });
  it("rejects invalid characters, impossible lengths and invalid UTF-8", () => {
    expectError("base64Decode", { input: "!!!!" }, "DECODING_ERROR");
    expectError("base64Decode", { input: "SGVsbG8gV" }, "DECODING_ERROR");
    expectError("base64Decode", { input: "/w==" }, "DECODING_ERROR");
    expectError("base64UrlDecode", { input: "/w==" }, "DECODING_ERROR");
    expectError("base64Decode", { input: 1 }, "INVALID_INPUT");
  });
});

describe("url encoding", () => {
  it("percent-encodes reserved characters and unicode", () => {
    expect(urlEncode("a+b c")).toBe("a%2Bb%20c");
    expect(urlEncode("héllo €")).toBe("h%C3%A9llo%20%E2%82%AC");
    expect(urlEncode("a/b?c=d&e")).toBe("a%2Fb%3Fc%3Dd%26e");
    expect(urlEncode("-_.!~*'()")).toBe("-_.!~*'()");
  });
  it("decodes and leaves + alone", () => {
    expect(urlDecode("a%2Bb%20c")).toBe("a+b c");
    expect(urlDecode("a+b")).toBe("a+b");
    expect(urlDecode("h%C3%A9llo%20%E2%82%AC")).toBe("héllo €");
  });
  it("rejects malformed escapes", () => {
    expectError("urlDecode", { input: "%E0%A4%A" }, "DECODING_ERROR");
    expectError("urlDecode", { input: "%" }, "DECODING_ERROR");
    expectError("urlDecode", { input: "%FF" }, "DECODING_ERROR");
  });
});

describe("hex", () => {
  it("round-trips", () => {
    expect(hexEncode("hi")).toBe("6869");
    expect(hexEncode("")).toBe("");
    expect(hexEncode("€")).toBe("e282ac");
    expect(hexDecode("6869")).toBe("hi");
    expect(hexDecode("6869".toUpperCase())).toBe("hi");
    expect(hexDecode("")).toBe("");
    expect(hexDecode("e282ac")).toBe("€");
  });
  it("rejects odd length, non-hex characters, and invalid UTF-8", () => {
    expectError("hexDecode", { input: "686" }, "DECODING_ERROR");
    expectError("hexDecode", { input: "zz" }, "DECODING_ERROR");
    expectError("hexDecode", { input: "ff" }, "DECODING_ERROR");
    expectError("hexDecode", { input: "68 69" }, "DECODING_ERROR");
  });
});

describe("hashes (known vectors)", () => {
  it("sha256", () => {
    expect(hashSha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hashSha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
  it("sha1", () => {
    expect(hashSha1("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(hashSha1("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
  it("sha512", () => {
    expect(hashSha512("")).toBe(
      "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e"
    );
    expect(hashSha512("abc")).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
    );
  });
  it("md5", () => {
    expect(hashMd5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(hashMd5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
  });
  it("hashes UTF-8 bytes, not UTF-16 units", () => {
    expect(hashMd5("€")).toBe(hashMd5(Buffer.from("€", "utf-8").toString()));
    expect(hashSha256("é")).not.toBe(hashSha256("e"));
  });
  it("hmacSha256", () => {
    expect(hmacSha256("message", "secret")).toBe(
      "8b5f48702995c1598c573db1e21866a9b825d4a794d169d7060a03605796360b"
    );
    // RFC 4231 test case 2
    expect(hmacSha256("what do ya want for nothing?", "Jefe")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    );
    expectError("hmacSha256", { input: "message" }, "INVALID_INPUT");
  });
  it("crc32", () => {
    expect(crc32("hello")).toBe("3610a686");
    expect(crc32("")).toBe("00000000");
    expect(crc32("The quick brown fox jumps over the lazy dog")).toBe("414fa339");
  });
  it("hash functions reject non-string input", () => {
    for (const name of ["hashSha256", "hashSha1", "hashSha512", "hashMd5", "crc32"]) {
      expectError(name, { input: null }, "INVALID_INPUT");
    }
  });
});

describe("uuidV5", () => {
  it("matches the RFC 4122 DNS example", () => {
    expect(uuidV5("example.com", UUID_NAMESPACES.dns)).toBe("cfbff0d1-9375-5685-968c-48ce8b15ae17");
    expect(execute(fn("uuidV5"), { name: "example.com" })).toEqual({
      success: true,
      result: "cfbff0d1-9375-5685-968c-48ce8b15ae17",
    });
  });
  it("is deterministic and sets version 5 / RFC variant bits", () => {
    const id = uuidV5("anything", UUID_NAMESPACES.oid);
    expect(uuidV5("anything", UUID_NAMESPACES.oid)).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidV5("anything", UUID_NAMESPACES.url)).not.toBe(id);
  });
  it("resolves the named namespaces", () => {
    for (const ns of ["dns", "url", "oid", "x500"] as const) {
      expect(execute(fn("uuidV5"), { name: "http://example.com", namespace: ns })).toEqual({
        success: true,
        result: uuidV5("http://example.com", UUID_NAMESPACES[ns]),
      });
    }
  });
  it("accepts an unhyphenated or uppercase namespace UUID", () => {
    const expected = uuidV5("x", UUID_NAMESPACES.dns);
    expect(uuidV5("x", UUID_NAMESPACES.dns.replace(/-/g, ""))).toBe(expected);
    expect(uuidV5("x", UUID_NAMESPACES.dns.toUpperCase())).toBe(expected);
  });
  it("rejects a namespace that is not a UUID", () => {
    expectError("uuidV5", { name: "x", namespace: "nope" }, "INVALID_INPUT");
    expectError(
      "uuidV5",
      { name: "x", namespace: "cfbff0d1-9375-5685-968c-48ce8b15ae1" },
      "INVALID_INPUT"
    );
    expectError("uuidV5", { namespace: "dns" }, "INVALID_INPUT");
  });
});

describe("jwtDecode", () => {
  const header = { alg: "HS256", typ: "JWT" };
  it("decodes header, payload and signature without verifying", () => {
    const token = `${b64url(header)}.${b64url({ sub: "42", exp: 1700000000, nbf: 1600000000 })}.sig`;
    expect(jwtDecode(token)).toEqual({
      header,
      payload: { sub: "42", exp: 1700000000, nbf: 1600000000 },
      signature: "sig",
      times: { exp: "2023-11-14T22:13:20.000Z", nbf: "2020-09-13T12:26:40.000Z" },
    });
  });
  it("tolerates surrounding whitespace and an empty signature", () => {
    const token = ` ${b64url(header)}.${b64url({ a: 1 })}. `;
    expect(jwtDecode(token)).toMatchObject({ payload: { a: 1 }, signature: "", times: {} });
  });
  it("ignores non-numeric time claims", () => {
    expect(jwtDecode(`${b64url(header)}.${b64url({ exp: "soon" })}.x`).times).toEqual({});
  });
  it("rejects tokens that are not three parts", () => {
    expectError("jwtDecode", { token: "a.b" }, "INVALID_JWT");
    expectError("jwtDecode", { token: "a.b.c.d" }, "INVALID_JWT");
    expectError("jwtDecode", { token: "" }, "INVALID_JWT");
  });
  it("rejects non-JSON or non-object sections", () => {
    const notJson = Buffer.from("not json").toString("base64url");
    expectError("jwtDecode", { token: `${b64url(header)}.${notJson}.sig` }, "INVALID_JWT");
    expectError("jwtDecode", { token: `${notJson}.${b64url({})}.sig` }, "INVALID_JWT");
    expectError("jwtDecode", { token: `${b64url(header)}.${b64url([1, 2])}.sig` }, "INVALID_JWT");
    expectError("jwtDecode", { token: `${b64url(header)}.${b64url(null)}.sig` }, "INVALID_JWT");
  });
});
