/**
 * conversion/* — translate between data formats. Parsers are strict: input
 * that is not really the claimed format is rejected rather than coerced.
 */

import { z } from "zod";
import Papa from "papaparse";
import yaml from "js-yaml";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { marked } from "marked";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

type Obj = Record<string, unknown>;

/** Serialize rows to CSV. Columns are the union of all keys, in first-seen order. */
export function jsonToCsv(rows: Obj[]): string {
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
  const data = rows.map((row) => columns.map((c) => cell(row[c])));
  return Papa.unparse({ fields: columns, data }, { newline: "\n" });
}

/** Parse CSV with a header row into objects. Every cell is a string; empty lines are skipped. */
export function csvToJson(input: string): Obj[] {
  const result = Papa.parse<Obj>(input, { header: true, skipEmptyLines: true, delimiter: "," });
  const fatal = result.errors.filter(
    (e) => e.code !== "UndetectableDelimiter" && e.code !== "TooFewFields"
  );
  if (fatal.length > 0) {
    fail("PARSE_ERROR", `CSV parsing failed: ${fatal.map((e) => e.message).join("; ")}`, fatal);
  }
  return result.data;
}

/** Parse YAML (JSON-compatible subset only: no custom tags or JS types). */
export function yamlToJson(input: string): unknown {
  try {
    return yaml.load(input, { schema: yaml.JSON_SCHEMA }) ?? null;
  } catch (error) {
    return fail("PARSE_ERROR", error instanceof Error ? error.message : "Invalid YAML");
  }
}

export function jsonToYaml(value: unknown): string {
  return yaml.dump(value, { schema: yaml.JSON_SCHEMA, sortKeys: true, lineWidth: -1 });
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  // Keep text exactly as written: "00123" stays a string, and so does "1e5".
  parseTagValue: false,
  parseAttributeValue: false,
  // No DOCTYPE entity expansion (billion-laughs). This also switches off the
  // five predefined entities, which decodeXmlEntities restores below.
  processEntities: false,
});

const XML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
};

/** Decode the five predefined XML entities plus numeric references in every string leaf. */
export function decodeXmlEntities(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (match, body: string) => {
      if (body[0] !== "#") return XML_ENTITIES[match];
      const hex = body[1] === "x";
      const codePoint = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? match
        : String.fromCodePoint(codePoint);
    });
  }
  if (Array.isArray(value)) return value.map(decodeXmlEntities);
  if (value !== null && typeof value === "object") {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeXmlEntities(v);
    return out;
  }
  return value;
}

/** Parse well-formed XML into an object; attributes are prefixed with "@". */
export function xmlToJson(input: string): Obj {
  const check = XMLValidator.validate(input);
  if (check !== true) fail("PARSE_ERROR", `Invalid XML: ${check.err.msg}`, check.err);
  return decodeXmlEntities(xmlParser.parse(input)) as Obj;
}

/**
 * Render Markdown (GitHub-flavored) to HTML. The output is NOT sanitized:
 * raw HTML in the input passes through unchanged.
 */
export function markdownToHtml(input: string): string {
  return marked.parse(input, { async: false, gfm: true });
}

/** Render an array of objects as a GitHub-flavored Markdown table. */
export function jsonToMarkdownTable(rows: Obj[]): string {
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (v: unknown) =>
    (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v))
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
  const lines = [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((c) => cell(row[c])).join(" | ")} |`),
  ];
  return lines.join("\n");
}

export const functions = [
  defineFunction({
    name: "conversion/jsonToCsv",
    description:
      "Convert an array of flat objects to CSV with a header row. Columns are the union of all keys; nested values are JSON-encoded.",
    input: z.object({
      input: z.array(z.record(z.string(), z.unknown())).describe("Array of objects (rows)"),
    }),
    returns: "CSV text with \\n line endings",
    tags: ["conversion", "json", "csv", "table", "export"],
    examples: [
      {
        description: "Two rows",
        input: {
          input: [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
          ],
        },
        output: "name,age\nAlice,30\nBob,25",
      },
    ],
    run: (a) => jsonToCsv(a.input),
  }),
  defineFunction({
    name: "conversion/csvToJson",
    description:
      "Parse comma-separated CSV with a header row into an array of objects. Cell values are strings.",
    input: z.object({ input: z.string().describe("CSV text with a header row") }),
    returns: "array of objects keyed by header",
    tags: ["conversion", "csv", "json", "parse", "table"],
    examples: [
      {
        description: "Two rows",
        input: { input: "name,age\nAlice,30\nBob,25" },
        output: [
          { name: "Alice", age: "30" },
          { name: "Bob", age: "25" },
        ],
      },
    ],
    run: (a) => csvToJson(a.input),
  }),
  defineFunction({
    name: "conversion/yamlToJson",
    description:
      "Parse YAML into a JSON value (objects, arrays, strings, numbers, booleans, null). Custom tags are rejected.",
    input: z.object({ input: z.string().describe("YAML text") }),
    returns: "parsed JSON value",
    tags: ["conversion", "yaml", "json", "parse", "config"],
    examples: [
      {
        description: "Mapping",
        input: { input: "a: 1\nb: [x, y]" },
        output: { a: 1, b: ["x", "y"] },
      },
    ],
    run: (a) => yamlToJson(a.input),
  }),
  defineFunction({
    name: "conversion/jsonToYaml",
    description: "Serialize a JSON value as YAML with sorted keys.",
    input: z.object({ input: z.unknown().describe("JSON value to serialize") }),
    returns: "YAML text",
    tags: ["conversion", "json", "yaml", "serialize", "config"],
    examples: [
      {
        description: "Object",
        input: { input: { b: 1, a: [1, 2] } },
        output: "a:\n  - 1\n  - 2\nb: 1\n",
      },
    ],
    run: (a) => jsonToYaml(a.input),
  }),
  defineFunction({
    name: "conversion/xmlToJson",
    description:
      'Parse well-formed XML into a JSON object. Attributes become "@name" keys, repeated elements become arrays, and all text stays a string.',
    input: z.object({ input: z.string().describe("XML text") }),
    returns: "object mirroring the element tree",
    tags: ["conversion", "xml", "json", "parse"],
    examples: [
      {
        description: "Attributes and text",
        input: { input: '<a id="1"><b>00123</b></a>' },
        output: { a: { "@id": "1", b: "00123" } },
      },
    ],
    run: (a) => xmlToJson(a.input),
  }),
  defineFunction({
    name: "conversion/markdownToHtml",
    description:
      "Render GitHub-flavored Markdown to HTML. Output is NOT sanitized: raw HTML (including <script>) passes through, so sanitize before rendering in a trusted context.",
    input: z.object({ input: z.string().describe("Markdown text") }),
    returns: "HTML text",
    tags: ["conversion", "markdown", "html", "render"],
    examples: [
      { description: "Bold", input: { input: "**hi**" }, output: "<p><strong>hi</strong></p>\n" },
    ],
    run: (a) => markdownToHtml(a.input),
  }),
  defineFunction({
    name: "conversion/jsonToMarkdownTable",
    description:
      "Render an array of objects as a GitHub-flavored Markdown table. Columns are the union of all keys.",
    input: z.object({
      input: z.array(z.record(z.string(), z.unknown())).describe("Array of objects (rows)"),
    }),
    returns: "Markdown table text",
    tags: ["conversion", "json", "markdown", "table", "format"],
    examples: [
      {
        description: "Two rows",
        input: {
          input: [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
          ],
        },
        output: "| name | age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |",
      },
    ],
    run: (a) => jsonToMarkdownTable(a.input),
  }),
];
