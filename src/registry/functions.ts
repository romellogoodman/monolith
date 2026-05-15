/**
 * Function metadata registration.
 *
 * Name, description, category/subcategory, and parameter schema are derived
 * from the dispatch table — the single source of truth — so they can't drift.
 * Only the bits that genuinely can't be derived from a Zod schema live here:
 * examples, tags, and a human-readable `returns` string.
 */

import { z } from "zod";
import { dispatchEntries, type DispatchEntry } from "./dispatch.js";
import { registerFunction, getFunctionCount } from "./index.js";
import type { Example, ParameterInfo } from "../types/index.js";

interface FunctionExtras {
  /** Override subcategory when it's not in the name path (e.g. strings/truncate → manipulation). */
  subcategory?: string;
  returns: string;
  examples: Example[];
  tags: string[];
  performance?: string;
}

const EXTRAS: Record<string, FunctionExtras> = {
  "strings/toCamelCase": {
    subcategory: "case",
    returns: "string in camelCase format",
    tags: ["string", "case", "camelCase", "transform"],
    examples: [
      { description: "Hyphenated", input: { input: "hello-world" }, output: "helloWorld" },
      { description: "Spaced", input: { input: "Hello World" }, output: "helloWorld" },
    ],
  },
  "strings/toKebabCase": {
    subcategory: "case",
    returns: "string in kebab-case format",
    tags: ["string", "case", "kebabCase", "transform"],
    examples: [{ description: "camelCase", input: { input: "helloWorld" }, output: "hello-world" }],
  },
  "strings/toSnakeCase": {
    subcategory: "case",
    returns: "string in snake_case format",
    tags: ["string", "case", "snakeCase", "transform"],
    examples: [{ description: "camelCase", input: { input: "helloWorld" }, output: "hello_world" }],
  },
  "strings/toPascalCase": {
    subcategory: "case",
    returns: "string in PascalCase format",
    tags: ["string", "case", "pascalCase", "transform"],
    examples: [{ description: "Spaced", input: { input: "hello world" }, output: "HelloWorld" }],
  },
  "strings/toTitleCase": {
    subcategory: "case",
    returns: "string in Title Case format",
    tags: ["string", "case", "titleCase", "transform"],
    examples: [{ description: "camelCase", input: { input: "helloWorld" }, output: "Hello World" }],
  },
  "strings/slugify": {
    subcategory: "case",
    returns: "URL-safe lowercase slug",
    tags: ["string", "slug", "url", "transform"],
    examples: [{ description: "Title", input: { input: "My Blog Post!" }, output: "my-blog-post" }],
  },
  "strings/truncate": {
    subcategory: "manipulation",
    returns: "truncated string",
    tags: ["string", "truncate", "shorten", "ellipsis"],
    examples: [{ description: "Long string", input: { input: "Hello World", length: 8 }, output: "Hello..." }],
  },
  "strings/wordCount": {
    subcategory: "manipulation",
    returns: "object with words, chars, and lines counts",
    tags: ["string", "count", "words", "wc"],
    examples: [
      {
        description: "Two words",
        input: { input: "hello world" },
        output: { words: 2, chars: 11, lines: 1 },
      },
    ],
  },
  "strings/escapeHtml": {
    subcategory: "manipulation",
    returns: "HTML-escaped string",
    tags: ["string", "html", "escape", "sanitize"],
    examples: [{ description: "Tag", input: { input: "<b>bold</b>" }, output: "&lt;b&gt;bold&lt;/b&gt;" }],
  },
  "strings/unescapeHtml": {
    subcategory: "manipulation",
    returns: "unescaped string",
    tags: ["string", "html", "unescape", "entities"],
    examples: [{ description: "Entities", input: { input: "&lt;b&gt;" }, output: "<b>" }],
  },
  "validation/isEmail": {
    returns: "boolean indicating if input is a valid email",
    tags: ["validation", "email", "check", "verify"],
    examples: [
      { description: "Valid", input: { input: "user@example.com" }, output: true },
      { description: "Invalid", input: { input: "not-an-email" }, output: false },
    ],
  },
  "validation/isUrl": {
    returns: "boolean indicating if input is a valid URL",
    tags: ["validation", "url", "link", "check"],
    examples: [{ description: "Valid", input: { input: "https://example.com" }, output: true }],
  },
  "validation/isUuid": {
    returns: "boolean indicating if input is a valid UUID",
    tags: ["validation", "uuid", "guid", "check"],
    examples: [
      { description: "Valid", input: { input: "550e8400-e29b-41d4-a716-446655440000" }, output: true },
    ],
  },
  "validation/isJson": {
    returns: "boolean indicating if input is syntactically valid JSON",
    tags: ["validation", "json", "parse", "check"],
    examples: [
      { description: "Valid", input: { input: '{"a":1}' }, output: true },
      { description: "Invalid", input: { input: "{bad}" }, output: false },
    ],
  },
  "validation/isIsoDate": {
    returns: "boolean indicating if input is a valid ISO 8601 date",
    tags: ["validation", "date", "iso8601", "check"],
    examples: [{ description: "Valid", input: { input: "2026-05-15T00:00:00Z" }, output: true }],
  },
  "conversion/jsonToCsv": {
    returns: "CSV string representation",
    tags: ["conversion", "json", "csv", "format"],
    examples: [
      {
        description: "Array of objects",
        input: { input: [{ name: "Alice", age: 30 }] },
        output: "name,age\r\nAlice,30",
      },
    ],
    performance: "< 5ms",
  },
  "conversion/csvToJson": {
    returns: "array of objects",
    tags: ["conversion", "csv", "json", "parse"],
    examples: [
      { description: "Simple CSV", input: { input: "name,age\nAlice,30" }, output: [{ name: "Alice", age: "30" }] },
    ],
    performance: "< 5ms",
  },
  "conversion/yamlToJson": {
    returns: "parsed JSON value",
    tags: ["conversion", "yaml", "json", "parse"],
    examples: [{ description: "Mapping", input: { input: "a: 1\nb: 2" }, output: { a: 1, b: 2 } }],
    performance: "< 5ms",
  },
  "conversion/jsonToYaml": {
    returns: "YAML string",
    tags: ["conversion", "json", "yaml", "serialize"],
    examples: [{ description: "Object", input: { input: { a: 1 } }, output: "a: 1\n" }],
    performance: "< 5ms",
  },
  "conversion/xmlToJson": {
    returns: "parsed JSON object",
    tags: ["conversion", "xml", "json", "parse"],
    examples: [{ description: "Element", input: { input: "<a>1</a>" }, output: { a: 1 } }],
    performance: "< 5ms",
  },
  "conversion/markdownToHtml": {
    returns: "HTML string",
    tags: ["conversion", "markdown", "html", "render"],
    examples: [{ description: "Bold", input: { input: "**hi**" }, output: "<p><strong>hi</strong></p>\n" }],
    performance: "< 5ms",
  },
  "dates/parseDate": {
    subcategory: "parsing",
    returns: "ISO 8601 date string",
    tags: ["date", "parse", "iso", "format"],
    examples: [{ description: "Standard", input: { input: "2025-12-11" }, output: "2025-12-11T00:00:00.000Z" }],
    performance: "< 2ms",
  },
  "dates/formatDate": {
    subcategory: "formatting",
    returns: "formatted date string",
    tags: ["date", "format", "display"],
    examples: [
      { description: "US date", input: { isoDate: "2025-12-11T00:00:00.000Z", format: "MMMM d, yyyy" }, output: "December 11, 2025" },
    ],
    performance: "< 2ms",
  },
  "dates/addDays": {
    subcategory: "arithmetic",
    returns: "ISO date string with days added",
    tags: ["date", "add", "subtract", "arithmetic"],
    examples: [
      { description: "Add 7", input: { isoDate: "2025-12-11T00:00:00.000Z", days: 7 }, output: "2025-12-18T00:00:00.000Z" },
    ],
    performance: "< 2ms",
  },
  "dates/diffDays": {
    subcategory: "arithmetic",
    returns: "signed whole number of calendar days",
    tags: ["date", "diff", "difference", "arithmetic"],
    examples: [{ description: "One week", input: { from: "2026-01-01", to: "2026-01-08" }, output: 7 }],
    performance: "< 2ms",
  },
  "math/round": {
    returns: "rounded number",
    tags: ["math", "round", "decimal", "precision"],
    examples: [{ description: "2 decimals", input: { value: 3.14159, decimals: 2 }, output: 3.14 }],
  },
  "math/clamp": {
    returns: "clamped number",
    tags: ["math", "clamp", "limit", "constrain"],
    examples: [{ description: "Above max", input: { value: 100, min: 0, max: 50 }, output: 50 }],
  },
  "math/percentage": {
    returns: "percentage value",
    tags: ["math", "percentage", "ratio", "fraction"],
    examples: [{ description: "Quarter", input: { value: 25, total: 100 }, output: 25 }],
  },
  "data/arrays/unique": {
    returns: "array of unique values",
    tags: ["data", "array", "unique", "dedupe"],
    examples: [{ description: "Dedupe", input: { array: [1, 2, 2, 3] }, output: [1, 2, 3] }],
    performance: "< 2ms",
  },
  "data/arrays/sortBy": {
    returns: "sorted array",
    tags: ["data", "array", "sort", "order"],
    examples: [
      { description: "By age", input: { array: [{ age: 30 }, { age: 25 }], key: "age" }, output: [{ age: 25 }, { age: 30 }] },
    ],
    performance: "< 5ms",
  },
  "data/arrays/groupBy": {
    returns: "object mapping key values to arrays of items",
    tags: ["data", "array", "group", "partition"],
    examples: [
      { description: "By kind", input: { array: [{ kind: "a" }, { kind: "b" }], key: "kind" }, output: { a: [{ kind: "a" }], b: [{ kind: "b" }] } },
    ],
    performance: "< 5ms",
  },
  "data/arrays/flatten": {
    returns: "flattened array",
    tags: ["data", "array", "flatten", "nested"],
    examples: [{ description: "Deep", input: { array: [1, [2, [3]]] }, output: [1, 2, 3] }],
    performance: "< 2ms",
  },
  "data/objects/pick": {
    returns: "object with only the listed keys",
    tags: ["data", "object", "pick", "subset"],
    examples: [{ description: "Two keys", input: { object: { a: 1, b: 2, c: 3 }, keys: ["a", "b"] }, output: { a: 1, b: 2 } }],
  },
  "data/objects/omit": {
    returns: "object without the listed keys",
    tags: ["data", "object", "omit", "exclude"],
    examples: [{ description: "Drop one", input: { object: { a: 1, b: 2 }, keys: ["b"] }, output: { a: 1 } }],
  },
  "encoding/base64Encode": {
    returns: "base64 encoded string",
    tags: ["encoding", "base64", "encode"],
    examples: [{ description: "Simple", input: { input: "Hello World" }, output: "SGVsbG8gV29ybGQ=" }],
  },
  "encoding/base64Decode": {
    returns: "decoded string",
    tags: ["encoding", "base64", "decode"],
    examples: [{ description: "Simple", input: { input: "SGVsbG8gV29ybGQ=" }, output: "Hello World" }],
  },
  "encoding/urlEncode": {
    returns: "percent-encoded string",
    tags: ["encoding", "url", "uri", "encode"],
    examples: [{ description: "Space + slash", input: { input: "a b/c" }, output: "a%20b%2Fc" }],
  },
  "encoding/urlDecode": {
    returns: "decoded string",
    tags: ["encoding", "url", "uri", "decode"],
    examples: [{ description: "Percent-encoded", input: { input: "a%20b%2Fc" }, output: "a b/c" }],
  },
  "encoding/hexEncode": {
    returns: "lowercase hex string",
    tags: ["encoding", "hex", "encode"],
    examples: [{ description: "Simple", input: { input: "hi" }, output: "6869" }],
  },
  "encoding/hexDecode": {
    returns: "decoded UTF-8 string",
    tags: ["encoding", "hex", "decode"],
    examples: [{ description: "Simple", input: { input: "6869" }, output: "hi" }],
  },
  "encoding/hashSha256": {
    returns: "64-char lowercase hex digest",
    tags: ["encoding", "hash", "sha256", "digest", "checksum"],
    examples: [
      { description: "Empty", input: { input: "" }, output: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    ],
  },
  "encoding/hashMd5": {
    returns: "32-char lowercase hex digest (non-cryptographic)",
    tags: ["encoding", "hash", "md5", "digest", "checksum"],
    examples: [
      { description: "Empty", input: { input: "" }, output: "d41d8cd98f00b204e9800998ecf8427e" },
    ],
  },
};

/** Derive ParameterInfo[] from a Zod object schema via its JSON Schema projection. */
function deriveParameters(schema: DispatchEntry["schema"]): ParameterInfo[] {
  const js = z.toJSONSchema(schema, { io: "input" }) as {
    properties?: Record<string, { type?: string | string[]; description?: string; default?: unknown }>;
    required?: string[];
  };
  const required = new Set(js.required ?? []);
  return Object.entries(js.properties ?? {}).map(([name, prop]) => {
    const type = Array.isArray(prop.type) ? prop.type.join(" | ") : (prop.type ?? "unknown");
    const info: ParameterInfo = {
      name,
      type,
      description: prop.description ?? "",
      required: required.has(name),
    };
    if (prop.default !== undefined) info.default = prop.default;
    return info;
  });
}

/** Derive category + subcategory from `a/b/c`-style names. */
function splitName(name: string): { category: string; subcategory?: string } {
  const parts = name.split("/");
  return {
    category: parts[0],
    subcategory: parts.length > 2 ? parts[1] : undefined,
  };
}

/**
 * Register all utility functions, deriving metadata from the dispatch table.
 */
export function registerAllFunctions() {
  if (getFunctionCount() > 0) return;

  for (const e of dispatchEntries) {
    const extras = EXTRAS[e.name];
    const { category, subcategory } = splitName(e.name);
    registerFunction({
      name: e.name,
      category,
      subcategory: extras?.subcategory ?? subcategory,
      description: e.description,
      parameters: deriveParameters(e.schema),
      returns: extras?.returns ?? "",
      examples: extras?.examples ?? [],
      tags: extras?.tags ?? [category],
      performance: extras?.performance ?? "< 1ms",
    });
  }
}
