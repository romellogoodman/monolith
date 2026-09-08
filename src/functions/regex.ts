/**
 * regex/* — JavaScript regular expressions with guard rails: bounded input
 * size, a schema-validated flag set, and a stable INVALID_PATTERN error for
 * patterns the engine rejects.
 */

import { z } from "zod";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

export interface Match {
  /** The full matched text. */
  match: string;
  /** Offset of the match in the input (UTF-16 code units). */
  index: number;
  /** Numbered capture groups in order; null when a group did not participate. */
  groups: Array<string | null>;
  /** Named capture groups that participated in the match. */
  named: Record<string, string>;
}

/** Compile a pattern, adding or removing the "g" flag as the caller needs. */
export function compile(pattern: string, flags = "", global?: boolean): RegExp {
  let f = flags.replace("g", "");
  if (global) f += "g";
  try {
    return new RegExp(pattern, f);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("INVALID_PATTERN", message);
  }
}

export function test(input: string, pattern: string, flags = ""): boolean {
  return compile(pattern, flags, false).test(input);
}

/** Every match in the input. Zero-length matches advance one character, so they cannot loop forever. */
export function match(input: string, pattern: string, flags = ""): Match[] {
  const re = compile(pattern, flags, true);
  const matches: Match[] = [];
  for (const m of input.matchAll(re)) {
    const named: Record<string, string> = {};
    for (const [key, value] of Object.entries(m.groups ?? {}))
      if (value !== undefined) named[key] = value;
    matches.push({
      match: m[0],
      index: m.index,
      groups: m.slice(1).map((g) => g ?? null),
      named,
    });
  }
  return matches;
}

/** Replace matches. `replacement` uses String.prototype.replace syntax: $1, $<name>, $&, $$. */
export function replace(
  input: string,
  pattern: string,
  replacement: string,
  flags = "",
  all = true
): string {
  return input.replace(compile(pattern, flags, all), replacement);
}

/** Backslash-escape the characters that are special in a pattern (safe under the u flag). */
export function escape(input: string): string {
  return input.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

/** Split by pattern. Capturing groups are spliced into the result, as with String.prototype.split. */
export function split(input: string, pattern: string, flags = "", limit?: number): string[] {
  return input.split(compile(pattern, flags, false), limit);
}

const inputField = z
  .string()
  .max(1_000_000)
  .describe("Text to search (at most 1,000,000 characters)");
const patternField = z
  .string()
  .max(10_000)
  .describe("JavaScript regular expression source, without slashes");
const flagsField = z
  .string()
  .regex(/^(?!.*(.).*\1)[gimsuy]*$/, "flags must be a subset of gimsuy with no repeats")
  .default("")
  .describe(
    "Flags: i (ignore case), m (multiline), s (dotAll), u (unicode), y (sticky); g is managed per function"
  );

export const functions = [
  defineFunction({
    name: "regex/test",
    description:
      "Test whether a regular expression matches anywhere in the text. Returns a boolean.",
    input: z.object({ input: inputField, pattern: patternField, flags: flagsField }),
    returns: "true when the pattern matches",
    tags: ["regex", "test", "match", "pattern", "validate"],
    examples: [
      {
        description: "Case-insensitive match",
        input: { input: "Order #4521", pattern: "^order #\\d+$", flags: "i" },
        output: true,
      },
      { description: "No match", input: { input: "hello", pattern: "^\\d+$" }, output: false },
    ],
    run: (a) => test(a.input, a.pattern, a.flags),
  }),
  defineFunction({
    name: "regex/match",
    description:
      "Find every match of a pattern in the text (always global). Each result carries the matched text, its index, numbered capture groups and named groups.",
    input: z.object({ input: inputField, pattern: patternField, flags: flagsField }),
    returns: "array of { match, index, groups, named }",
    tags: ["regex", "match", "extract", "capture", "groups", "find-all"],
    examples: [
      {
        description: "Named and numbered groups",
        input: { input: "2024-05-01 and 2025-12-31", pattern: "(?<year>\\d{4})-(\\d{2})-(\\d{2})" },
        output: [
          { match: "2024-05-01", index: 0, groups: ["2024", "05", "01"], named: { year: "2024" } },
          { match: "2025-12-31", index: 15, groups: ["2025", "12", "31"], named: { year: "2025" } },
        ],
      },
      {
        description: "Unmatched optional group is null",
        input: { input: "a1 b", pattern: "([a-z])(\\d)?" },
        output: [
          { match: "a1", index: 0, groups: ["a", "1"], named: {} },
          { match: "b", index: 3, groups: ["b", null], named: {} },
        ],
      },
    ],
    run: (a) => match(a.input, a.pattern, a.flags),
  }),
  defineFunction({
    name: "regex/replace",
    description:
      "Replace every match (or only the first with all=false) using String.replace substitution syntax: $1, $<name>, $& for the whole match, $$ for a literal dollar.",
    input: z.object({
      input: inputField,
      pattern: patternField,
      replacement: z.string().describe("Replacement text; supports $1, $<name>, $&, $$"),
      flags: flagsField,
      all: z
        .boolean()
        .default(true)
        .describe("Replace all matches (true) or only the first (false)"),
    }),
    returns: "text with replacements applied",
    tags: ["regex", "replace", "substitute", "rewrite", "sed"],
    examples: [
      {
        description: "Reorder with named groups",
        input: {
          input: "Doe, Jane; Smith, John",
          pattern: "(?<last>\\w+), (?<first>\\w+)",
          replacement: "$<first> $<last>",
        },
        output: "Jane Doe; John Smith",
      },
      {
        description: "First match only",
        input: { input: "a-b-c", pattern: "-", replacement: "+", all: false },
        output: "a+b-c",
      },
    ],
    run: (a) => replace(a.input, a.pattern, a.replacement, a.flags, a.all),
  }),
  defineFunction({
    name: "regex/escape",
    description:
      "Escape a literal string so it can be embedded in a pattern and match itself exactly (backslashes the special characters).",
    input: z.object({ input: z.string().max(1_000_000).describe("Literal text to escape") }),
    returns: "escaped pattern source",
    tags: ["regex", "escape", "literal", "quote"],
    examples: [
      {
        description: "Special characters",
        input: { input: "price: $5.00 (approx.)" },
        output: "price: \\$5\\.00 \\(approx\\.\\)",
      },
    ],
    run: (a) => escape(a.input),
  }),
  defineFunction({
    name: "regex/split",
    description:
      "Split text by a pattern into an array. Capturing groups in the pattern are included in the output, as with String.split.",
    input: z.object({
      input: inputField,
      pattern: patternField,
      flags: flagsField,
      limit: z.number().int().min(0).optional().describe("Maximum number of pieces to return"),
    }),
    returns: "array of substrings",
    tags: ["regex", "split", "tokenize", "delimiter"],
    examples: [
      {
        description: "Any whitespace or comma run",
        input: { input: "a, b  c,d", pattern: "[\\s,]+" },
        output: ["a", "b", "c", "d"],
      },
      {
        description: "With a limit",
        input: { input: "k=v=w", pattern: "=", limit: 2 },
        output: ["k", "v"],
      },
    ],
    run: (a) => split(a.input, a.pattern, a.flags, a.limit),
  }),
];
