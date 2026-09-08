import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  dedent,
  diff,
  escapeHtml,
  functions,
  indent,
  levenshtein,
  similarity,
  slugify,
  toCamelCase,
  toConstantCase,
  toKebabCase,
  toPascalCase,
  toSentenceCase,
  toSnakeCase,
  toTitleCase,
  truncate,
  unescapeHtml,
  wordCount,
  words,
  wrap,
} from "../../../src/functions/strings.js";

const byName = (name: string) => {
  const fn = functions.find((f) => f.name === name);
  if (!fn) throw new Error(`no function ${name}`);
  return fn;
};

const invalid = { success: false, errorCode: "INVALID_INPUT" };

describe("strings examples", () => {
  for (const fn of functions) {
    for (const example of fn.examples) {
      it(`${fn.name}: ${example.description}`, () => {
        expect(execute(fn, example.input)).toEqual({ success: true, result: example.output });
      });
    }
  }
});

describe("words", () => {
  it("splits on separators and case boundaries", () => {
    expect(words("hello-world_foo bar")).toEqual(["hello", "world", "foo", "bar"]);
    expect(words("helloWorld")).toEqual(["hello", "world"]);
    expect(words("XMLHttpRequest")).toEqual(["xml", "http", "request"]);
    expect(words("version2Beta")).toEqual(["version2", "beta"]);
  });

  it("keeps Unicode letters", () => {
    expect(words("café au lait")).toEqual(["café", "au", "lait"]);
    expect(words("Ünïcödé Wörds")).toEqual(["ünïcödé", "wörds"]);
  });

  it("returns nothing for empty or separator-only input", () => {
    expect(words("")).toEqual([]);
    expect(words("  --  ")).toEqual([]);
  });
});

describe("case conversions", () => {
  it("toCamelCase", () => {
    expect(toCamelCase("café au lait")).toBe("caféAuLait");
    expect(toCamelCase("XMLHttpRequest")).toBe("xmlHttpRequest");
    expect(toCamelCase("__FOO_BAR__")).toBe("fooBar");
    expect(toCamelCase("")).toBe("");
  });

  it("toPascalCase", () => {
    expect(toPascalCase("hello-world")).toBe("HelloWorld");
    expect(toPascalCase("café au lait")).toBe("CaféAuLait");
  });

  it("toKebabCase", () => {
    expect(toKebabCase("HelloWorld foo")).toBe("hello-world-foo");
    expect(toKebabCase("XMLHttpRequest")).toBe("xml-http-request");
  });

  it("toSnakeCase", () => {
    expect(toSnakeCase("Hello World")).toBe("hello_world");
    expect(toSnakeCase("already_snake")).toBe("already_snake");
  });

  it("toConstantCase", () => {
    expect(toConstantCase("hello world")).toBe("HELLO_WORLD");
    expect(toConstantCase("café")).toBe("CAFÉ");
  });

  it("toTitleCase", () => {
    expect(toTitleCase("hello_world-foo")).toBe("Hello World Foo");
  });

  it("toSentenceCase", () => {
    expect(toSentenceCase("HELLO_WORLD foo")).toBe("Hello world foo");
    expect(toSentenceCase("")).toBe("");
  });

  it("reject non-string input through execute", () => {
    for (const name of [
      "toCamelCase",
      "toPascalCase",
      "toKebabCase",
      "toSnakeCase",
      "toConstantCase",
      "toTitleCase",
      "toSentenceCase",
    ]) {
      expect(execute(byName(`strings/${name}`), { input: 5 })).toMatchObject(invalid);
    }
  });
});

describe("slugify", () => {
  it("strips diacritics and punctuation", () => {
    expect(slugify("Crème brûlée à la mode!")).toBe("creme-brulee-a-la-mode");
    expect(slugify("  Hello,   World  ")).toBe("hello-world");
    expect(slugify("Ünïcödé")).toBe("unicode");
  });

  it("drops characters with no ASCII decomposition", () => {
    expect(slugify("日本語 text")).toBe("text");
    expect(slugify("")).toBe("");
    expect(slugify("---")).toBe("");
  });

  it("rejects non-string input through execute", () => {
    expect(execute(byName("strings/slugify"), { input: null })).toMatchObject(invalid);
  });
});

describe("truncate", () => {
  it("cuts with the suffix included in the length", () => {
    expect(truncate("Hello World", 8)).toBe("Hello...");
    expect(truncate("Hello World", 8, "…")).toBe("Hello W…");
    expect(truncate("Hello", 5)).toBe("Hello");
  });

  it("drops the suffix when it would not fit", () => {
    expect(truncate("Hello World", 3)).toBe("Hel");
    expect(truncate("Hello World", 2, "…")).toBe("H…");
    expect(truncate("Hello World", 1, "…")).toBe("H");
  });

  it("never splits a surrogate pair", () => {
    expect(truncate("a😀bcd", 3)).toBe("a😀b");
    expect(truncate("a😀bcd", 4, "…")).toBe("a😀b…");
    expect(truncate("😀😀😀", 2, "")).toBe("😀😀");
    expect(truncate("😀😀", 2)).toBe("😀😀");
  });

  it("rejects a non-positive length through execute", () => {
    expect(execute(byName("strings/truncate"), { input: "x", length: 0 })).toMatchObject(invalid);
  });
});

describe("wordCount", () => {
  it.each([
    ["", { words: 0, chars: 0, lines: 0 }],
    ["a", { words: 1, chars: 1, lines: 1 }],
    ["a\n", { words: 1, chars: 2, lines: 1 }],
    ["a\nb", { words: 2, chars: 3, lines: 2 }],
    ["\n", { words: 0, chars: 1, lines: 1 }],
    ["a\r\nb", { words: 2, chars: 4, lines: 2 }],
    ["  two   words  ", { words: 2, chars: 15, lines: 1 }],
    ["😀 x", { words: 2, chars: 3, lines: 1 }],
  ])("%j", (input, expected) => {
    expect(wordCount(input)).toEqual(expected);
  });

  it("rejects a missing input through execute", () => {
    expect(execute(byName("strings/wordCount"), {})).toMatchObject(invalid);
  });
});

describe("escapeHtml and unescapeHtml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;"
    );
    expect(escapeHtml("plain")).toBe("plain");
  });

  it("round-trips through unescapeHtml", () => {
    const raw = `<b class="x">Tom & Jerry's &amp; "friends"</b>`;
    expect(unescapeHtml(escapeHtml(raw))).toBe(raw);
  });

  it("decodes named, decimal, and hex references", () => {
    expect(unescapeHtml("&#65;&#x42;&#X43;")).toBe("ABC");
    expect(unescapeHtml("&copy; &mdash; &nbsp;&hellip;")).toBe("© — \u00a0…");
    expect(unescapeHtml("&#128512;")).toBe("😀");
  });

  it("leaves unknown, surrogate, and out-of-range references untouched", () => {
    expect(unescapeHtml("&zzz;")).toBe("&zzz;");
    expect(unescapeHtml("&#xD800;")).toBe("&#xD800;");
    expect(unescapeHtml("&#xDFFF;")).toBe("&#xDFFF;");
    expect(unescapeHtml("&#1114112;")).toBe("&#1114112;");
    expect(unescapeHtml("& #65; &# 65")).toBe("& #65; &# 65");
    expect(unescapeHtml("&AMP;")).toBe("&AMP;");
  });

  it("reject non-string input through execute", () => {
    expect(execute(byName("strings/escapeHtml"), { input: 1 })).toMatchObject(invalid);
    expect(execute(byName("strings/unescapeHtml"), { input: [] })).toMatchObject(invalid);
  });
});

describe("levenshtein and similarity", () => {
  it("computes edit distance over code points", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("😀a", "😀b")).toBe(1);
  });

  it("scores identical strings as 1 and empty strings as 1", () => {
    expect(similarity("same", "same")).toEqual({ distance: 0, similarity: 1 });
    expect(similarity("", "")).toEqual({ distance: 0, similarity: 1 });
  });

  it("scores disjoint strings as 0 and partial matches in between", () => {
    expect(similarity("abc", "xyz")).toEqual({ distance: 3, similarity: 0 });
    expect(similarity("", "ab")).toEqual({ distance: 2, similarity: 0 });
    expect(similarity("kitten", "sitting").similarity).toBeCloseTo(1 - 3 / 7);
  });

  it("rejects a missing operand through execute", () => {
    expect(execute(byName("strings/similarity"), { a: "x" })).toMatchObject(invalid);
  });
});

describe("wrap", () => {
  it("wraps greedily at the width", () => {
    expect(wrap("the quick brown fox jumps over", 10)).toBe("the quick\nbrown fox\njumps over");
    expect(wrap("aa bb cc", 5)).toBe("aa bb\ncc");
  });

  it("keeps long words whole", () => {
    expect(wrap("abcdefghij kl", 5)).toBe("abcdefghij\nkl");
    expect(wrap("a abcdefghij b", 5)).toBe("a\nabcdefghij\nb");
  });

  it("preserves existing and blank lines", () => {
    expect(wrap("one two\n\nthree four", 7)).toBe("one two\n\nthree\nfour");
    expect(wrap("a\r\nb", 80)).toBe("a\nb");
    expect(wrap("", 10)).toBe("");
    expect(wrap("\n", 10)).toBe("\n");
  });

  it("collapses runs of spaces and tabs", () => {
    expect(wrap("a   b\t\tc", 80)).toBe("a b c");
  });

  it("rejects a zero width through execute", () => {
    expect(execute(byName("strings/wrap"), { input: "x", width: 0 })).toMatchObject(invalid);
  });
});

describe("dedent", () => {
  it("removes the common indentation", () => {
    expect(dedent("    a\n      b\n    c")).toBe("a\n  b\nc");
    expect(dedent("\t\ta\n\t\t\tb")).toBe("a\n\tb");
  });

  it("ignores blank and whitespace-only lines when measuring and blanks them", () => {
    expect(dedent("  a\n\n    b\n  \n")).toBe("a\n\n  b\n\n");
    expect(dedent("\n\n")).toBe("\n\n");
    expect(dedent("   ")).toBe("");
  });

  it("leaves unindented text alone and normalizes CRLF", () => {
    expect(dedent("a\n  b")).toBe("a\n  b");
    expect(dedent("  a\r\n  b")).toBe("a\nb");
    expect(dedent("")).toBe("");
  });

  it("rejects non-string input through execute", () => {
    expect(execute(byName("strings/dedent"), { input: {} })).toMatchObject(invalid);
  });
});

describe("indent", () => {
  it("prefixes non-empty lines with two spaces by default", () => {
    expect(indent("a\nb")).toBe("  a\n  b");
    expect(indent("a", "> ")).toBe("> a");
  });

  it("skips empty lines", () => {
    expect(indent("a\n\nb\n")).toBe("  a\n\n  b\n");
    expect(indent("")).toBe("");
    expect(indent("\n\n")).toBe("\n\n");
  });

  it("rejects a non-string prefix through execute", () => {
    expect(execute(byName("strings/indent"), { input: "a", prefix: 4 })).toMatchObject(invalid);
  });
});

describe("diff", () => {
  it("reports no change for identical strings", () => {
    expect(diff("a\nb\n", "a\nb\n")).toEqual({ patch: "", added: 0, removed: 0, changed: false });
    expect(diff("", "")).toEqual({ patch: "", added: 0, removed: 0, changed: false });
  });

  it("produces a unified patch with counts and no timestamps", () => {
    const out = diff("x\ny\nz\n", "x\nY\nz\nw\n");
    expect(out).toEqual({
      patch: "--- a\n+++ b\n@@ -1,3 +1,4 @@\n x\n-y\n+Y\n z\n+w\n",
      added: 2,
      removed: 1,
      changed: true,
    });
  });

  it("honours context and labels", () => {
    const out = diff("1\n2\n3\n4\n5\n", "1\n2\nX\n4\n5\n", 1, { a: "old.txt", b: "new.txt" });
    expect(out.patch).toBe("--- old.txt\n+++ new.txt\n@@ -2,3 +2,3 @@\n 2\n-3\n+X\n 4\n");
    expect(diff("1\n2\n3\n", "1\n2\nX\n", 0).patch).toBe("--- a\n+++ b\n@@ -3,1 +3,1 @@\n-3\n+X\n");
  });

  it("handles additions from empty and missing trailing newlines", () => {
    expect(diff("", "hi\n")).toEqual({
      patch: "--- a\n+++ b\n@@ -0,0 +1,1 @@\n+hi\n",
      added: 1,
      removed: 0,
      changed: true,
    });
    const out = diff("x", "y");
    expect(out.added).toBe(1);
    expect(out.removed).toBe(1);
    expect(out.patch).toContain("\\ No newline at end of file");
  });

  it("rejects negative context and partial labels through execute", () => {
    const fn = byName("strings/diff");
    expect(execute(fn, { a: "x", b: "y", context: -1 })).toMatchObject(invalid);
    expect(execute(fn, { a: "x", b: "y", labels: { a: "only" } })).toMatchObject(invalid);
  });
});
