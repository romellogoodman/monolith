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
    execute: (raw) => run(schema.parse(raw)),
  };
}

export const dispatchEntries: DispatchEntry[] = [
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
    "strings/truncate",
    "Truncate string to specified length with optional suffix",
    stringSchemas.truncateSchema,
    (a) => stringManipulation.truncate(a.input, a.length, a.suffix)
  ),
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
];

const entryByName = new Map(dispatchEntries.map((e) => [e.name, e]));

export function getDispatchEntry(name: string): DispatchEntry | undefined {
  return entryByName.get(name);
}
