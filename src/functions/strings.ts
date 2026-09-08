/**
 * strings/* — case conversion, manipulation, and text measurement.
 */

import { createTwoFilesPatch, diffLines, FILE_HEADERS_ONLY } from "diff";
import { z } from "zod";
import { defineFunction } from "../core/define.js";

const text = (description: string) => z.string().describe(description);

// ---------------------------------------------------------------------------
// Implementations (exported for direct use and unit tests)
// ---------------------------------------------------------------------------

/**
 * Split an arbitrarily-cased string into lowercase words. Unicode-aware:
 * letters and digits in any script count as word characters; everything
 * else is a separator. camelCase / PascalCase / ACRONYMCase boundaries split.
 */
export function words(input: string): string[] {
  return input
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export const toCamelCase = (input: string): string =>
  words(input)
    .map((w, i) => (i === 0 ? w : capitalize(w)))
    .join("");
export const toPascalCase = (input: string): string => words(input).map(capitalize).join("");
export const toKebabCase = (input: string): string => words(input).join("-");
export const toSnakeCase = (input: string): string => words(input).join("_");
export const toConstantCase = (input: string): string => words(input).join("_").toUpperCase();
export const toTitleCase = (input: string): string => words(input).map(capitalize).join(" ");
export const toSentenceCase = (input: string): string => capitalize(words(input).join(" "));

/** Lowercase, hyphen-separated, ASCII-only slug. Diacritics are stripped (café → cafe). */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Truncate to at most `length` characters (Unicode code points, so an emoji
 * is never split in half). When the suffix itself would not fit, the input is
 * simply cut to `length` with no suffix.
 */
export function truncate(input: string, length: number, suffix = "..."): string {
  const chars = Array.from(input);
  if (chars.length <= length) return input;
  const suffixLen = Array.from(suffix).length;
  if (suffixLen >= length) return chars.slice(0, length).join("");
  return chars.slice(0, length - suffixLen).join("") + suffix;
}

export interface TextCounts {
  words: number;
  chars: number;
  lines: number;
}

/**
 * Count words (whitespace-separated), characters (code points), and lines.
 * A line is a newline-terminated or final unterminated segment, so "a\n" and
 * "a" both have 1 line and "" has 0.
 */
export function wordCount(input: string): TextCounts {
  const trimmed = input.trim();
  const segments = input.split(/\r?\n/);
  if (segments[segments.length - 1] === "") segments.pop();
  return {
    words: trimmed === "" ? 0 : trimmed.split(/\s+/).length,
    chars: Array.from(input).length,
    lines: segments.length,
  };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const HTML_UNESCAPES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&laquo;": "«",
  "&raquo;": "»",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&euro;": "€",
  "&pound;": "£",
  "&yen;": "¥",
  "&deg;": "°",
  "&times;": "×",
  "&middot;": "·",
};

export const escapeHtml = (input: string): string =>
  input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/**
 * Decode named entities from the table above plus any numeric (&#65;) or hex
 * (&#x41;) character reference. Unknown or out-of-range references are left
 * untouched, as are surrogate code points (which are invalid in UTF-8 text).
 */
export function unescapeHtml(input: string): string {
  return input.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] !== "#") return HTML_UNESCAPES[match] ?? match;
    const hex = body[1] === "x" || body[1] === "X";
    const codePoint = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    if (!Number.isFinite(codePoint) || codePoint > 0x10ffff || isSurrogate) return match;
    return String.fromCodePoint(codePoint);
  });
}

/** Levenshtein edit distance between two strings (code-point based). */
export function levenshtein(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[t.length];
}

export interface Similarity {
  distance: number;
  /** 1 - distance / max(length); 1 means identical, 0 means nothing shared. */
  similarity: number;
}

export function similarity(a: string, b: string): Similarity {
  const distance = levenshtein(a, b);
  const max = Math.max(Array.from(a).length, Array.from(b).length);
  return { distance, similarity: max === 0 ? 1 : 1 - distance / max };
}

/** Greedy word wrap at `width` columns; words longer than `width` are kept whole. */
export function wrap(input: string, width: number): string {
  return input
    .split(/\r?\n/)
    .map((paragraph) => {
      const out: string[] = [];
      let line = "";
      for (const word of paragraph.split(/[ \t]+/).filter(Boolean)) {
        if (line === "") line = word;
        else if (line.length + 1 + word.length <= width) line += " " + word;
        else {
          out.push(line);
          line = word;
        }
      }
      if (line !== "" || paragraph === "") out.push(line);
      return out.join("\n");
    })
    .join("\n");
}

/** Remove the common leading indentation from every non-blank line. */
export function dedent(input: string): string {
  const lines = input.split(/\r?\n/);
  const indents = lines.filter((l) => l.trim() !== "").map((l) => /^[ \t]*/.exec(l)![0].length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((l) => (l.trim() === "" ? "" : l.slice(common))).join("\n");
}

/** Prefix every non-blank line with `prefix` (default two spaces). */
export function indent(input: string, prefix = "  "): string {
  return input
    .split(/\r?\n/)
    .map((l) => (l === "" ? l : prefix + l))
    .join("\n");
}

export interface DiffResult {
  /** Unified diff text with `---`/`+++` headers and no timestamps; empty when the inputs are identical. */
  patch: string;
  added: number;
  removed: number;
  changed: boolean;
}

/**
 * Line-oriented unified diff of `a` against `b`. `added`/`removed` count
 * lines; a final line without a trailing newline counts as its own line, so
 * "b" → "b\n" reports one removed and one added.
 */
export function diff(
  a: string,
  b: string,
  context = 3,
  labels: { a: string; b: string } = { a: "a", b: "b" }
): DiffResult {
  if (a === b) return { patch: "", added: 0, removed: 0, changed: false };
  let added = 0;
  let removed = 0;
  for (const change of diffLines(a, b)) {
    if (change.added) added += change.count ?? 0;
    else if (change.removed) removed += change.count ?? 0;
  }
  const patch = createTwoFilesPatch(labels.a, labels.b, a, b, "", "", {
    context,
    headerOptions: FILE_HEADERS_ONLY,
  });
  return { patch, added, removed, changed: true };
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

function caseFn(
  suffix: string,
  description: string,
  run: (input: string) => string,
  examples: Array<[string, string]>,
  tags: string[]
) {
  return defineFunction({
    name: `strings/${suffix}`,
    description,
    input: z.object({ input: text("String to convert") }),
    returns: "converted string",
    tags: ["string", "case", ...tags],
    examples: examples.map(([input, output]) => ({
      description: JSON.stringify(input),
      input: { input },
      output,
    })),
    run: (a) => run(a.input),
  });
}

export const functions = [
  caseFn(
    "toCamelCase",
    "Convert any-cased text to camelCase. Splits on spaces, punctuation, and case boundaries; Unicode letters are kept.",
    toCamelCase,
    [
      ["hello-world", "helloWorld"],
      ["Hello World", "helloWorld"],
      ["XMLHttpRequest", "xmlHttpRequest"],
    ],
    ["camelCase"]
  ),
  caseFn(
    "toPascalCase",
    "Convert any-cased text to PascalCase.",
    toPascalCase,
    [["hello world", "HelloWorld"]],
    ["pascalCase"]
  ),
  caseFn(
    "toKebabCase",
    "Convert any-cased text to kebab-case.",
    toKebabCase,
    [["helloWorld", "hello-world"]],
    ["kebabCase"]
  ),
  caseFn(
    "toSnakeCase",
    "Convert any-cased text to snake_case.",
    toSnakeCase,
    [["helloWorld", "hello_world"]],
    ["snakeCase"]
  ),
  caseFn(
    "toConstantCase",
    "Convert any-cased text to CONSTANT_CASE (upper snake case).",
    toConstantCase,
    [["helloWorld", "HELLO_WORLD"]],
    ["constantCase", "screamingSnake"]
  ),
  caseFn(
    "toTitleCase",
    "Convert any-cased text to Title Case (every word capitalized).",
    toTitleCase,
    [["helloWorld", "Hello World"]],
    ["titleCase"]
  ),
  caseFn(
    "toSentenceCase",
    "Convert any-cased text to Sentence case (first word capitalized).",
    toSentenceCase,
    [["hello-world foo", "Hello world foo"]],
    ["sentenceCase"]
  ),
  defineFunction({
    name: "strings/slugify",
    description:
      "Convert text to a URL-safe lowercase slug: ASCII letters and digits separated by single hyphens. Diacritics are stripped (café → cafe).",
    input: z.object({ input: text("String to slugify") }),
    returns: "URL-safe lowercase slug",
    tags: ["string", "slug", "url"],
    examples: [
      { description: "Title", input: { input: "My Blog Post!" }, output: "my-blog-post" },
      { description: "Diacritics", input: { input: "Café au lait" }, output: "cafe-au-lait" },
    ],
    run: (a) => slugify(a.input),
  }),
  defineFunction({
    name: "strings/truncate",
    description:
      "Shorten text to at most `length` characters, ending with `suffix` when cut. Counts Unicode code points so emoji are never split.",
    input: z.object({
      input: text("String to truncate"),
      length: z
        .number()
        .int()
        .positive()
        .describe("Maximum length in characters, including the suffix"),
      suffix: z.string().default("...").describe("Appended when the string is cut"),
    }),
    returns: "string of at most `length` characters",
    tags: ["string", "truncate", "shorten", "ellipsis"],
    examples: [
      {
        description: "Cut with suffix",
        input: { input: "Hello World", length: 8 },
        output: "Hello...",
      },
      { description: "Fits", input: { input: "Hi", length: 8 }, output: "Hi" },
      {
        description: "Custom suffix",
        input: { input: "Hello World", length: 6, suffix: "…" },
        output: "Hello…",
      },
    ],
    run: (a) => truncate(a.input, a.length, a.suffix),
  }),
  defineFunction({
    name: "strings/wordCount",
    description:
      "Count words, characters, and lines in text, like a deterministic `wc`. Characters are Unicode code points.",
    input: z.object({ input: text("Text to measure") }),
    returns: "object with `words`, `chars`, and `lines`",
    tags: ["string", "count", "words", "wc", "length"],
    examples: [
      {
        description: "Two words",
        input: { input: "hello world" },
        output: { words: 2, chars: 11, lines: 1 },
      },
      {
        description: "Trailing newline",
        input: { input: "a\nb\n" },
        output: { words: 2, chars: 4, lines: 2 },
      },
    ],
    run: (a) => wordCount(a.input),
  }),
  defineFunction({
    name: "strings/escapeHtml",
    description: "Escape the five HTML-significant characters (& < > \" ') as entities.",
    input: z.object({ input: text("Text to escape") }),
    returns: "HTML-safe string",
    tags: ["string", "html", "escape", "sanitize"],
    examples: [
      { description: "Tag", input: { input: "<b>bold</b>" }, output: "&lt;b&gt;bold&lt;/b&gt;" },
    ],
    run: (a) => escapeHtml(a.input),
  }),
  defineFunction({
    name: "strings/unescapeHtml",
    description:
      "Decode HTML entities: common named entities (&amp; &lt; &nbsp; &copy; &mdash; …) plus any numeric (&#65;) or hex (&#x41;) reference. Unknown entities are left as-is.",
    input: z.object({ input: text("Text containing HTML entities") }),
    returns: "decoded string",
    tags: ["string", "html", "unescape", "entities", "decode"],
    examples: [
      { description: "Named", input: { input: "&lt;b&gt; &amp; &copy;" }, output: "<b> & ©" },
      { description: "Numeric", input: { input: "&#65;&#x42;" }, output: "AB" },
    ],
    run: (a) => unescapeHtml(a.input),
  }),
  defineFunction({
    name: "strings/similarity",
    description:
      "Compare two strings: Levenshtein edit distance and a normalized similarity score from 0 (nothing shared) to 1 (identical).",
    input: z.object({ a: text("First string"), b: text("Second string") }),
    returns: "object with `distance` (edits) and `similarity` (0–1)",
    tags: ["string", "similarity", "levenshtein", "distance", "fuzzy", "compare"],
    examples: [
      {
        description: "One edit",
        input: { a: "kitten", b: "sitten" },
        output: { distance: 1, similarity: 1 - 1 / 6 },
      },
      {
        description: "Identical",
        input: { a: "same", b: "same" },
        output: { distance: 0, similarity: 1 },
      },
    ],
    run: (a) => similarity(a.a, a.b),
  }),
  defineFunction({
    name: "strings/wrap",
    description:
      "Word-wrap text so no line exceeds `width` characters. Existing line breaks are kept; words longer than `width` stay whole.",
    input: z.object({
      input: text("Text to wrap"),
      width: z.number().int().positive().default(80).describe("Maximum line width"),
    }),
    returns: "wrapped text with `\\n` line breaks",
    tags: ["string", "wrap", "format", "width", "fold"],
    examples: [
      {
        description: "Width 10",
        input: { input: "the quick brown fox jumps", width: 10 },
        output: "the quick\nbrown fox\njumps",
      },
    ],
    run: (a) => wrap(a.input, a.width),
  }),
  defineFunction({
    name: "strings/dedent",
    description:
      "Remove the common leading indentation from every line (blank lines are ignored when measuring).",
    input: z.object({ input: text("Indented text") }),
    returns: "text with shared indentation removed",
    tags: ["string", "indent", "dedent", "whitespace", "format"],
    examples: [
      { description: "Four spaces", input: { input: "    a\n      b\n" }, output: "a\n  b\n" },
    ],
    run: (a) => dedent(a.input),
  }),
  defineFunction({
    name: "strings/indent",
    description: "Prefix every non-empty line with `prefix` (default two spaces).",
    input: z.object({
      input: text("Text to indent"),
      prefix: z.string().default("  ").describe("String prepended to each non-empty line"),
    }),
    returns: "indented text",
    tags: ["string", "indent", "whitespace", "format"],
    examples: [{ description: "Tab", input: { input: "a\nb", prefix: "\t" }, output: "\ta\n\tb" }],
    run: (a) => indent(a.input, a.prefix),
  }),
  defineFunction({
    name: "strings/diff",
    description:
      "Unified diff of two texts, line by line, like `diff -u`. Returns the patch text plus counts of added and removed lines.",
    input: z.object({
      a: text("Original text"),
      b: text("Modified text"),
      context: z
        .number()
        .int()
        .nonnegative()
        .default(3)
        .describe("Unchanged lines shown around each change"),
      labels: z
        .object({
          a: z.string().describe("Name for the original"),
          b: z.string().describe("Name for the modified"),
        })
        .default({ a: "a", b: "b" })
        .describe("File names used in the --- / +++ header lines"),
    }),
    returns:
      "object with `patch` (unified diff, empty when identical), `added`, `removed` (line counts), and `changed`",
    tags: ["string", "diff", "patch", "compare", "unified", "changes"],
    examples: [
      {
        description: "One line changed",
        input: { a: "x\ny\nz\n", b: "x\nY\nz\n" },
        output: {
          patch: "--- a\n+++ b\n@@ -1,3 +1,3 @@\n x\n-y\n+Y\n z\n",
          added: 1,
          removed: 1,
          changed: true,
        },
      },
      {
        description: "Identical",
        input: { a: "same\n", b: "same\n" },
        output: { patch: "", added: 0, removed: 0, changed: false },
      },
    ],
    run: (a) => diff(a.a, a.b, a.context, a.labels),
  }),
];
