/**
 * The registry is derived entirely from the function modules: nothing is
 * registered by hand, so the MCP server, CLI, and discovery tools cannot
 * drift from one another.
 */

import { z } from "zod";
import { createRequire } from "node:module";
import { splitName, type AnyFunction } from "./define.js";
import { levenshtein } from "../functions/strings.js";

import { functions as strings } from "../functions/strings.js";
import { functions as validation } from "../functions/validation.js";
import { functions as conversion } from "../functions/conversion.js";
import { functions as dates } from "../functions/dates.js";
import { functions as math } from "../functions/math.js";
import { functions as data } from "../functions/data.js";
import { functions as encoding } from "../functions/encoding.js";
import { functions as json } from "../functions/json.js";
import { functions as semver } from "../functions/semver.js";
import { functions as paths } from "../functions/paths.js";
import { functions as urls } from "../functions/urls.js";
import { functions as regex } from "../functions/regex.js";
import { functions as color } from "../functions/color.js";

const pkg = createRequire(import.meta.url)("../../package.json") as { version: string };
export const VERSION: string = pkg.version;

/** Category descriptions shown by `list_categories` / `monolith list`. */
export const CATEGORIES: Record<string, string> = {
  strings: "Case conversion, slugs, truncation, wrapping, HTML escaping, similarity",
  validation: "Boolean checks for emails, URLs, UUIDs, JSON, dates, IPs, semver",
  conversion: "CSV, YAML, XML, Markdown, and table format conversion",
  dates: "ISO 8601 parsing, formatting, and arithmetic, always in UTC",
  math: "Rounding, clamping, percentages, statistics, base and byte formatting",
  data: "Array and object helpers: unique, sort, group, flatten, pick, omit",
  encoding: "Base64, hex, URL encoding, hashes, HMAC, CRC32, UUID v5, JWT decoding",
  json: "Query (JMESPath, JSON Pointer), diff and patch (RFC 6902), format, JSONC, schema validation",
  semver: "Semantic version parsing, comparison, ranges, and bumping",
  paths: "POSIX path parsing, joining, normalizing, and containment checks",
  urls: "URL parsing, building, query editing, resolving, and normalizing",
  regex: "Regular expression test, match, replace, split, and escape",
  color: "CSS color conversion, WCAG contrast, mixing, and HSL adjustment",
};

export const functions: readonly AnyFunction[] = Object.freeze([
  ...strings,
  ...validation,
  ...conversion,
  ...dates,
  ...math,
  ...data,
  ...encoding,
  ...json,
  ...semver,
  ...paths,
  ...urls,
  ...regex,
  ...color,
]);

const byName = new Map(functions.map((fn) => [fn.name, fn]));
const byToolName = new Map(functions.map((fn) => [toToolName(fn.name), fn]));

/** MCP tool names may not contain "/", so `strings/toCamelCase` is exposed as `strings_toCamelCase`. */
export function toToolName(name: string): string {
  return name.replace(/\//g, "_");
}

/** Look up by canonical name (`strings/toCamelCase`) or MCP tool name (`strings_toCamelCase`). */
export function getFunction(name: string): AnyFunction | undefined {
  return byName.get(name) ?? byToolName.get(name);
}

export interface CategoryInfo {
  name: string;
  description: string;
  count: number;
}

export function listCategories(): CategoryInfo[] {
  const counts = new Map<string, number>();
  for (const fn of functions) {
    const { category } = splitName(fn.name);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, description: CATEGORIES[name] ?? "", count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Keyword search over name, description, and tags. Results are ranked:
 * name matches first, then tag matches, then description matches.
 */
export function searchFunctions(query: string, category?: string): AnyFunction[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored = functions
    .filter((fn) => !category || splitName(fn.name).category === category)
    .map((fn) => {
      const name = fn.name.toLowerCase();
      const tags = fn.tags.map((t) => t.toLowerCase());
      const description = fn.description.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (name.includes(term)) score += 3;
        else if (tags.some((t) => t.includes(term))) score += 2;
        else if (description.includes(term)) score += 1;
        else return { fn, score: 0 };
      }
      return { fn, score };
    })
    .filter((s) => s.score > 0);
  return scored
    .sort((a, b) => b.score - a.score || a.fn.name.localeCompare(b.fn.name))
    .map((s) => s.fn);
}

/** Closest function names to a misspelled one, for "did you mean" hints. */
export function suggestFunctions(name: string, limit = 3): string[] {
  const target = name.toLowerCase();
  const leaf = target.split("/").pop() ?? target;
  return functions
    .map((fn) => {
      const full = fn.name.toLowerCase();
      const fnLeaf = full.split("/").pop() ?? full;
      const distance = Math.min(levenshtein(target, full), levenshtein(leaf, fnLeaf) + 1);
      return { name: fn.name, distance };
    })
    .filter((s) => s.distance <= Math.max(2, Math.floor(leaf.length / 3)))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((s) => s.name);
}

export interface ParameterInfo {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
  /** Accepted values, when the parameter is an enum. */
  enum?: unknown[];
}

export interface FunctionMetadata {
  name: string;
  toolName: string;
  category: string;
  subcategory?: string;
  description: string;
  parameters: ParameterInfo[];
  returns: string;
  tags: string[];
  examples: AnyFunction["examples"];
}

interface JsonSchemaObject {
  properties?: Record<
    string,
    { type?: string | string[]; description?: string; default?: unknown; enum?: unknown[] }
  >;
  required?: string[];
}

export function inputJsonSchema(fn: AnyFunction): Record<string, unknown> {
  const schema = z.toJSONSchema(fn.input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export function describeFunction(fn: AnyFunction): FunctionMetadata {
  const js = inputJsonSchema(fn) as JsonSchemaObject;
  const required = new Set(js.required ?? []);
  const parameters = Object.entries(js.properties ?? {}).map(([name, prop]) => {
    const type = Array.isArray(prop.type) ? prop.type.join(" | ") : (prop.type ?? "any");
    const info: ParameterInfo = {
      name,
      type,
      description: prop.description ?? "",
      required: required.has(name),
    };
    if (prop.default !== undefined) info.default = prop.default;
    if (prop.enum) info.enum = prop.enum;
    return info;
  });
  const { category, subcategory } = splitName(fn.name);
  return {
    name: fn.name,
    toolName: toToolName(fn.name),
    category,
    ...(subcategory && { subcategory }),
    description: fn.description,
    parameters,
    returns: fn.returns,
    tags: fn.tags,
    examples: fn.examples,
  };
}

/** Fields the schema requires, in declaration order (used for positional and stdin binding). */
export function requiredFields(fn: AnyFunction): string[] {
  const js = inputJsonSchema(fn) as JsonSchemaObject;
  return Object.keys(js.properties ?? {}).filter((k) => (js.required ?? []).includes(k));
}

/** First path segment of a function name. */
export const splitCategory = (name: string): string => splitName(name).category;
