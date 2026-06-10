/**
 * Tests for string utility functions
 */

import { describe, it, expect } from "vitest";
import {
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  toPascalCase,
  toTitleCase,
  slugify,
} from "../../../src/utils/strings/case.js";
import {
  truncate,
  wordCount,
  escapeHtml,
  unescapeHtml,
} from "../../../src/utils/strings/manipulation.js";
import type { UtilityResponse } from "../../../src/types/index.js";

function ok<T>(r: UtilityResponse<T>): T {
  expect(r.success).toBe(true);
  return (r as { success: true; result: T }).result;
}

describe("String Case Utilities", () => {
  it.each([
    ["hello-world", "helloWorld"],
    ["Hello World", "helloWorld"],
    ["FOO_BAR_BAZ", "fooBarBaz"],
    ["alreadyCamel", "alreadyCamel"],
  ])("toCamelCase(%j) → %j", (input, expected) => {
    expect(ok(toCamelCase(input))).toBe(expected);
  });

  it.each([
    ["helloWorld", "hello-world"],
    ["Hello World", "hello-world"],
    ["FOO_BAR", "foo-bar"],
  ])("toKebabCase(%j) → %j", (input, expected) => {
    expect(ok(toKebabCase(input))).toBe(expected);
  });

  it.each([
    ["helloWorld", "hello_world"],
    ["Hello World", "hello_world"],
    ["hello-world", "hello_world"],
  ])("toSnakeCase(%j) → %j", (input, expected) => {
    expect(ok(toSnakeCase(input))).toBe(expected);
  });

  it.each([
    ["hello world", "HelloWorld"],
    ["hello-world", "HelloWorld"],
    ["helloWorld", "HelloWorld"],
  ])("toPascalCase(%j) → %j", (input, expected) => {
    expect(ok(toPascalCase(input))).toBe(expected);
  });

  it.each([
    ["helloWorld", "Hello World"],
    ["hello-world", "Hello World"],
    ["HELLO_WORLD", "Hello World"],
  ])("toTitleCase(%j) → %j", (input, expected) => {
    expect(ok(toTitleCase(input))).toBe(expected);
  });

  it.each([
    ["My Blog Post!", "my-blog-post"],
    ["Café au Lait", "cafe-au-lait"],
    ["  --trim--  ", "trim"],
    ["a--b___c", "a-b-c"],
  ])("slugify(%j) → %j", (input, expected) => {
    expect(ok(slugify(input))).toBe(expected);
  });
});

describe("String Manipulation Utilities", () => {
  it("truncate shortens and appends suffix", () => {
    expect(ok(truncate("Hello World", 8))).toBe("Hello...");
  });

  it("truncate is a no-op when under the limit", () => {
    expect(ok(truncate("Hi", 10))).toBe("Hi");
  });

  it("truncate never exceeds length when the suffix is longer than length", () => {
    const r = ok(truncate("Hello World", 2));
    expect(r.length).toBeLessThanOrEqual(2);
    expect(r).toBe("..");
  });

  it("wordCount counts words, chars, lines", () => {
    expect(ok(wordCount("hello world"))).toEqual({ words: 2, chars: 11, lines: 1 });
  });

  it("wordCount returns zeros for empty string", () => {
    expect(ok(wordCount(""))).toEqual({ words: 0, chars: 0, lines: 0 });
  });

  it("wordCount counts multiline content", () => {
    expect(ok(wordCount("a\nb\nc"))).toEqual({ words: 3, chars: 5, lines: 3 });
  });

  it("escapeHtml escapes the five HTML-significant characters", () => {
    expect(ok(escapeHtml(`<b a="1">&'</b>`))).toBe("&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;");
  });

  it("unescapeHtml reverses escapeHtml", () => {
    const original = `<b a="1">&'</b>`;
    expect(ok(unescapeHtml(ok(escapeHtml(original))))).toBe(original);
  });
});
