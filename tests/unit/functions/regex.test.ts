import { describe, it, expect } from "vitest";
import { execute } from "../../../src/core/define.js";
import { escape, functions, match, replace, split, test } from "../../../src/functions/regex.js";

const fn = (name: string) => functions.find((f) => f.name === `regex/${name}`)!;

describe("regex/test", () => {
  it("tests with and without flags", () => {
    expect(test("Hello", "^hello$")).toBe(false);
    expect(test("Hello", "^hello$", "i")).toBe(true);
    expect(test("a\nb", "^b$", "m")).toBe(true);
    expect(test("😀", "^.$", "u")).toBe(true);
  });

  it("rejects an invalid pattern", () => {
    expect(execute(fn("test"), { input: "x", pattern: "(" })).toMatchObject({
      success: false,
      errorCode: "INVALID_PATTERN",
    });
  });

  it("rejects invalid flags via the schema", () => {
    expect(execute(fn("test"), { input: "x", pattern: "x", flags: "x" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(execute(fn("test"), { input: "x", pattern: "x", flags: "ii" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });

  it("rejects input over 1,000,000 characters via the schema", () => {
    expect(execute(fn("test"), { input: "a".repeat(1_000_001), pattern: "a" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("regex/match", () => {
  it("returns every match with numbered and named groups", () => {
    expect(match("x=1, y=22", "(?<key>[a-z])=(\\d+)")).toEqual([
      { match: "x=1", index: 0, groups: ["x", "1"], named: { key: "x" } },
      { match: "y=22", index: 5, groups: ["y", "22"], named: { key: "y" } },
    ]);
  });

  it("is global even when the g flag is absent or present", () => {
    expect(match("aaa", "a").length).toBe(3);
    expect(match("aaa", "a", "g").length).toBe(3);
  });

  it("reports unmatched groups as null and omits unmatched named groups", () => {
    expect(match("ab", "(a)(x)?(?<n>y)?")).toEqual([
      { match: "a", index: 0, groups: ["a", null, null], named: {} },
    ]);
  });

  it("terminates on zero-length matches", () => {
    expect(match("abc", "").map((m) => m.index)).toEqual([0, 1, 2, 3]);
    expect(match("abc", "x*").length).toBe(4);
    expect(match("ab", "^")).toEqual([{ match: "", index: 0, groups: [], named: {} }]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(match("abc", "\\d")).toEqual([]);
  });

  it("rejects an invalid pattern", () => {
    expect(execute(fn("match"), { input: "x", pattern: "[" })).toMatchObject({
      success: false,
      errorCode: "INVALID_PATTERN",
    });
  });
});

describe("regex/replace", () => {
  it("replaces all by default with $1 and $<name> substitutions", () => {
    expect(replace("a1b2", "(\\d)", "[$1]")).toBe("a[1]b[2]");
    expect(replace("john smith", "(?<f>\\w+) (?<l>\\w+)", "$<l>, $<f>")).toBe("smith, john");
    expect(replace("cost", "cost", "$$5")).toBe("$5");
  });

  it("replaces only the first match with all=false", () => {
    expect(replace("aaa", "a", "b", "", false)).toBe("baa");
    expect(replace("aaa", "a", "b", "g", false)).toBe("baa");
  });

  it("rejects an invalid pattern", () => {
    expect(execute(fn("replace"), { input: "x", pattern: "*", replacement: "" })).toMatchObject({
      success: false,
      errorCode: "INVALID_PATTERN",
    });
  });
});

describe("regex/escape", () => {
  it("makes the result match the literal input", () => {
    const literal = "1+1=2? (yes) [maybe] {no} ^$|. \\ /";
    const escaped = escape(literal);
    expect(new RegExp(`^${escaped}$`).test(literal)).toBe(true);
    expect(new RegExp(`^${escaped}$`, "u").test(literal)).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    expect(escape("hello world-1")).toBe("hello world-1");
  });

  it("rejects a non-string input", () => {
    expect(execute(fn("escape"), { input: 1 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("regex/split", () => {
  it("splits by pattern, honoring flags and limit", () => {
    expect(split("a1b2c", "\\d")).toEqual(["a", "b", "c"]);
    expect(split("aXbxc", "x", "i")).toEqual(["a", "b", "c"]);
    expect(split("a,b,c", ",", "", 2)).toEqual(["a", "b"]);
  });

  it("includes capturing groups like String.split", () => {
    expect(split("a1b", "(\\d)")).toEqual(["a", "1", "b"]);
  });

  it("rejects an invalid pattern", () => {
    expect(execute(fn("split"), { input: "x", pattern: "(?<" })).toMatchObject({
      success: false,
      errorCode: "INVALID_PATTERN",
    });
  });
});
