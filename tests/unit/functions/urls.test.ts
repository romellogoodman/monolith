import { describe, it, expect } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  build,
  functions,
  normalize,
  parse,
  resolve,
  setQuery,
} from "../../../src/functions/urls.js";

const fn = (name: string) => functions.find((f) => f.name === `urls/${name}`)!;

describe("urls/parse", () => {
  it("collects repeated query keys into arrays", () => {
    const parsed = parse("https://example.com/?a=1&b=2&a=3&a=4");
    expect(parsed.query).toEqual({ a: ["1", "3", "4"], b: "2" });
    expect(parsed.search).toBe("?a=1&b=2&a=3&a=4");
  });

  it("decodes query values and strips the hash marker", () => {
    const parsed = parse("https://example.com/p?q=a%26b+c#frag%20ment");
    expect(parsed.query).toEqual({ q: "a&b c" });
    expect(parsed.hash).toBe("frag%20ment");
    expect(parsed.protocol).toBe("https");
    expect(parsed.port).toBeNull();
  });

  it("converts unicode hostnames to punycode", () => {
    expect(parse("https://bücher.example/").hostname).toBe("xn--bcher-kva.example");
  });

  it("reports non-default ports as strings", () => {
    expect(parse("http://h:8080/").port).toBe("8080");
    expect(parse("http://h:8080/").host).toBe("h:8080");
  });

  it("fails on an invalid URL", () => {
    expect(execute(fn("parse"), { input: "not a url" })).toMatchObject({
      success: false,
      errorCode: "INVALID_URL",
    });
    expect(execute(fn("parse"), { input: "" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("urls/build", () => {
  it("defaults to https and encodes query values", () => {
    expect(build({ hostname: "example.com", query: { q: "a&b", n: 1, ok: true } })).toBe(
      "https://example.com/?q=a%26b&n=1&ok=true"
    );
  });

  it("drops default ports and repeats array keys", () => {
    expect(build({ hostname: "example.com", protocol: "https", port: 443 })).toBe(
      "https://example.com/"
    );
    expect(build({ hostname: "h", pathname: "/p", query: { x: [1, 2] } })).toBe(
      "https://h/p?x=1&x=2"
    );
  });

  it("rejects a protocol containing a colon via the schema", () => {
    expect(execute(fn("build"), { hostname: "h", protocol: "https:" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });

  it("fails on an unparseable hostname", () => {
    expect(execute(fn("build"), { hostname: "exa mple.com" })).toMatchObject({
      success: false,
      errorCode: "INVALID_URL",
    });
  });
});

describe("urls/setQuery", () => {
  it("replaces in place, adds, and removes", () => {
    expect(setQuery("https://h/?a=1&b=2&c=3", { b: "x", d: 4, a: null })).toBe(
      "https://h/?b=x&c=3&d=4"
    );
  });

  it("replaces every occurrence of a repeated key", () => {
    expect(setQuery("https://h/?a=1&a=2&b=3", { a: ["x", "y"] })).toBe("https://h/?b=3&a=x&a=y");
    expect(setQuery("https://h/?a=1&a=2&b=3", { a: "z" })).toBe("https://h/?a=z&b=3");
  });

  it("fails on an invalid URL", () => {
    expect(execute(fn("setQuery"), { url: "nope", query: { a: "1" } })).toMatchObject({
      success: false,
      errorCode: "INVALID_URL",
    });
  });
});

describe("urls/resolve", () => {
  it("resolves relative references", () => {
    const base = "https://example.com/a/b/c?x=1#h";
    expect(resolve("d", base)).toBe("https://example.com/a/b/d");
    expect(resolve("../d", base)).toBe("https://example.com/a/d");
    expect(resolve("?y=2", base)).toBe("https://example.com/a/b/c?y=2");
    expect(resolve("#top", base)).toBe("https://example.com/a/b/c?x=1#top");
    expect(resolve("//other.org/p", base)).toBe("https://other.org/p");
    expect(resolve("http://abs/", base)).toBe("http://abs/");
  });

  it("fails on an invalid base", () => {
    expect(execute(fn("resolve"), { url: "x", base: "relative/base" })).toMatchObject({
      success: false,
      errorCode: "INVALID_URL",
    });
  });
});

describe("urls/normalize", () => {
  it("canonicalizes case, ports, dot segments and query order", () => {
    expect(normalize("HTTP://WWW.Example.com:80/a/../b/?b=2&a=1&a=0#")).toBe(
      "http://www.example.com/b/?a=1&a=0&b=2"
    );
  });

  it("drops an empty query and fragment", () => {
    expect(normalize("https://h/p?")).toBe("https://h/p");
    expect(normalize("https://h/p?#")).toBe("https://h/p");
  });

  it("is idempotent", () => {
    const once = normalize("https://Example.com/x/./y?z=1&y=2");
    expect(normalize(once)).toBe(once);
  });

  it("fails on an invalid URL", () => {
    expect(execute(fn("normalize"), { input: "://bad" })).toMatchObject({
      success: false,
      errorCode: "INVALID_URL",
    });
  });
});
