/**
 * Central dispatch table: function name → { schema, execute }.
 * Consumed by both the MCP server and the CLI so the two surfaces
 * stay in sync.
 */

import type { z } from "zod";
import type { UtilityResponse } from "../types/index.js";

import * as stringSchemas from "../schemas/strings.js";
import * as validationSchemas from "../schemas/validation.js";
import * as conversionSchemas from "../schemas/conversion.js";
import * as dateSchemas from "../schemas/dates.js";
import * as mathSchemas from "../schemas/math.js";
import * as dataSchemas from "../schemas/data.js";
import * as encodingSchemas from "../schemas/encoding.js";

import * as stringCase from "../utils/strings/case.js";
import * as stringManipulation from "../utils/strings/manipulation.js";
import * as validation from "../utils/validation/index.js";
import * as conversion from "../utils/conversion/index.js";
import * as dates from "../utils/dates/index.js";
import * as math from "../utils/math/index.js";
import * as arrays from "../utils/data/arrays.js";
import * as objects from "../utils/data/objects.js";
import * as encoding from "../utils/encoding/index.js";

export interface DispatchEntry {
  name: string;
  description: string;
  schema: z.ZodObject;
  execute: (args: unknown) => UtilityResponse<unknown>;
}

function entry<S extends z.ZodObject>(
  name: string,
  description: string,
  schema: S,
  run: (args: z.infer<S>) => UtilityResponse<unknown>
): DispatchEntry {
  return {
    name,
    description,
    schema,
    execute: (raw) => {
      const args = schema.parse(raw);
      const start = performance.now();
      const result = run(args);
      const executionTime = performance.now() - start;
      // Populate the documented `executionTime` metric (ms) on success.
      if (result.success) {
        result.metadata = { ...result.metadata, executionTime };
      }
      return result;
    },
  };
}

export const dispatchEntries: DispatchEntry[] = [
  // Strings — case
  entry(
    "strings/toCamelCase",
    "Convert string to camelCase format",
    stringSchemas.toCamelCaseSchema,
    (a) => stringCase.toCamelCase(a.input)
  ),
  entry(
    "strings/toKebabCase",
    "Convert string to kebab-case format",
    stringSchemas.toKebabCaseSchema,
    (a) => stringCase.toKebabCase(a.input)
  ),
  entry(
    "strings/toSnakeCase",
    "Convert string to snake_case format",
    stringSchemas.toSnakeCaseSchema,
    (a) => stringCase.toSnakeCase(a.input)
  ),
  entry(
    "strings/toPascalCase",
    "Convert string to PascalCase format",
    stringSchemas.toPascalCaseSchema,
    (a) => stringCase.toPascalCase(a.input)
  ),
  entry(
    "strings/toTitleCase",
    "Convert string to Title Case format",
    stringSchemas.toTitleCaseSchema,
    (a) => stringCase.toTitleCase(a.input)
  ),
  entry(
    "strings/slugify",
    "Convert string to a URL-safe lowercase slug",
    stringSchemas.slugifySchema,
    (a) => stringCase.slugify(a.input)
  ),
  // Strings — manipulation
  entry(
    "strings/truncate",
    "Truncate string to specified length with optional suffix",
    stringSchemas.truncateSchema,
    (a) => stringManipulation.truncate(a.input, a.length, a.suffix)
  ),
  entry(
    "strings/wordCount",
    "Count words, characters, and lines in a string",
    stringSchemas.wordCountSchema,
    (a) => stringManipulation.wordCount(a.input)
  ),
  entry(
    "strings/escapeHtml",
    "Escape HTML-significant characters (&, <, >, \", ')",
    stringSchemas.escapeHtmlSchema,
    (a) => stringManipulation.escapeHtml(a.input)
  ),
  entry(
    "strings/unescapeHtml",
    "Unescape common HTML entities (&amp;, &lt;, &gt;, &quot;, &#39;)",
    stringSchemas.unescapeHtmlSchema,
    (a) => stringManipulation.unescapeHtml(a.input)
  ),
  // Validation
  entry(
    "validation/isEmail",
    "Validate if string is a valid email address",
    validationSchemas.isEmailSchema,
    (a) => validation.isEmail(a.input)
  ),
  entry(
    "validation/isUrl",
    "Validate if string is a valid URL",
    validationSchemas.isUrlSchema,
    (a) => validation.isUrl(a.input)
  ),
  entry(
    "validation/isUuid",
    "Validate if string is a valid UUID",
    validationSchemas.isUuidSchema,
    (a) => validation.isUuid(a.input)
  ),
  entry(
    "validation/isJson",
    "Validate if string is syntactically valid JSON",
    validationSchemas.isJsonSchema,
    (a) => validation.isJson(a.input)
  ),
  entry(
    "validation/isIsoDate",
    "Validate if string is a valid ISO 8601 date",
    validationSchemas.isIsoDateSchema,
    (a) => validation.isIsoDate(a.input)
  ),
  // Conversion
  entry(
    "conversion/jsonToCsv",
    "Convert JSON array of objects to CSV string",
    conversionSchemas.jsonToCsvSchema,
    (a) => conversion.jsonToCsv(a.input as Array<Record<string, unknown>>)
  ),
  entry(
    "conversion/csvToJson",
    "Parse CSV string into JSON array of objects",
    conversionSchemas.csvToJsonSchema,
    (a) => conversion.csvToJson(a.input)
  ),
  entry(
    "conversion/yamlToJson",
    "Parse YAML string into a JSON value",
    conversionSchemas.yamlToJsonSchema,
    (a) => conversion.yamlToJson(a.input)
  ),
  entry(
    "conversion/jsonToYaml",
    "Serialize a JSON value to a YAML string",
    conversionSchemas.jsonToYamlSchema,
    (a) => conversion.jsonToYaml(a.input)
  ),
  entry(
    "conversion/xmlToJson",
    "Parse XML string into a JSON object",
    conversionSchemas.xmlToJsonSchema,
    (a) => conversion.xmlToJson(a.input)
  ),
  entry(
    "conversion/markdownToHtml",
    "Render Markdown to HTML. Output is NOT sanitized: raw HTML in the input (including <script> and on* handlers) passes through unchanged. Do not render the result in a trusted context without sanitizing it first.",
    conversionSchemas.markdownToHtmlSchema,
    (a) => conversion.markdownToHtml(a.input)
  ),
  // Dates
  entry(
    "dates/parseDate",
    "Parse date string to ISO 8601 format",
    dateSchemas.parseDateSchema,
    (a) => dates.parseDate(a.input, a.format)
  ),
  entry(
    "dates/formatDate",
    "Format ISO date string with custom pattern",
    dateSchemas.formatDateSchema,
    (a) => dates.formatDate(a.isoDate, a.format)
  ),
  entry(
    "dates/addDays",
    "Add or subtract days from ISO date",
    dateSchemas.addDaysSchema,
    (a) => dates.addDays(a.isoDate, a.days)
  ),
  entry(
    "dates/diffDays",
    "Whole calendar days between two ISO dates",
    dateSchemas.diffDaysSchema,
    (a) => dates.diffDays(a.from, a.to)
  ),
  // Math
  entry(
    "math/round",
    "Round number to specified decimal places",
    mathSchemas.roundSchema,
    (a) => math.round(a.value, a.decimals)
  ),
  entry(
    "math/clamp",
    "Clamp number between minimum and maximum values",
    mathSchemas.clampSchema,
    (a) => math.clamp(a.value, a.min, a.max)
  ),
  entry(
    "math/percentage",
    "Express a value as a percentage of a total",
    mathSchemas.percentageSchema,
    (a) => math.percentage(a.value, a.total, a.decimals)
  ),
  // Data — arrays
  entry(
    "data/arrays/unique",
    "Get unique values from array",
    dataSchemas.uniqueSchema,
    (a) => arrays.unique(a.array)
  ),
  entry(
    "data/arrays/sortBy",
    "Sort array of objects by key",
    dataSchemas.sortBySchema,
    (a) => arrays.sortBy(a.array as Array<Record<string, unknown>>, a.key, a.direction)
  ),
  entry(
    "data/arrays/groupBy",
    "Group array of objects by key value",
    dataSchemas.groupBySchema,
    (a) => arrays.groupBy(a.array as Array<Record<string, unknown>>, a.key)
  ),
  entry(
    "data/arrays/flatten",
    "Flatten a nested array to a given depth (or fully)",
    dataSchemas.flattenSchema,
    (a) => arrays.flatten(a.array, a.depth)
  ),
  // Data — objects
  entry(
    "data/objects/pick",
    "Return a new object with only the listed keys",
    dataSchemas.pickSchema,
    (a) => objects.pick(a.object as Record<string, unknown>, a.keys)
  ),
  entry(
    "data/objects/omit",
    "Return a new object without the listed keys",
    dataSchemas.omitSchema,
    (a) => objects.omit(a.object as Record<string, unknown>, a.keys)
  ),
  // Encoding
  entry(
    "encoding/base64Encode",
    "Encode string to base64",
    encodingSchemas.base64EncodeSchema,
    (a) => encoding.base64Encode(a.input)
  ),
  entry(
    "encoding/base64Decode",
    "Decode base64 string",
    encodingSchemas.base64DecodeSchema,
    (a) => encoding.base64Decode(a.input)
  ),
  entry(
    "encoding/urlEncode",
    "Percent-encode a string for use in a URL component",
    encodingSchemas.urlEncodeSchema,
    (a) => encoding.urlEncode(a.input)
  ),
  entry(
    "encoding/urlDecode",
    "Decode a percent-encoded URL component",
    encodingSchemas.urlDecodeSchema,
    (a) => encoding.urlDecode(a.input)
  ),
  entry(
    "encoding/hexEncode",
    "Encode a UTF-8 string to lowercase hex",
    encodingSchemas.hexEncodeSchema,
    (a) => encoding.hexEncode(a.input)
  ),
  entry(
    "encoding/hexDecode",
    "Decode a hex string to UTF-8",
    encodingSchemas.hexDecodeSchema,
    (a) => encoding.hexDecode(a.input)
  ),
  entry(
    "encoding/hashSha256",
    "SHA-256 hex digest of a UTF-8 string",
    encodingSchemas.hashSha256Schema,
    (a) => encoding.hashSha256(a.input)
  ),
  entry(
    "encoding/hashMd5",
    "MD5 hex digest of a UTF-8 string (non-cryptographic use)",
    encodingSchemas.hashMd5Schema,
    (a) => encoding.hashMd5(a.input)
  ),
];

const entryByName = new Map(dispatchEntries.map((e) => [e.name, e]));

export function getDispatchEntry(name: string): DispatchEntry | undefined {
  return entryByName.get(name);
}
