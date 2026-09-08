/**
 * json/* — query, address, diff, patch, format, and validate JSON documents.
 * Every function takes an already-parsed JSON value (or JSON text where the
 * name says so) and never mutates its input.
 */

import { z } from "zod";
import jmespath from "jmespath";
import jsonpatch, { type Operation } from "fast-json-patch";
import { parse as jsoncParse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { Validator, type Schema, type SchemaDraft } from "@cfworker/json-schema";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

/**
 * Any JSON value. `z.unknown()` rather than `z.json()` so documents pass
 * through untouched (z.json() rebuilds objects and drops own `__proto__` keys).
 */
const jsonValue = (description: string) =>
  z
    .unknown()
    .refine((v) => v !== undefined, { message: "Required" })
    .describe(description);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

/** Evaluate a JMESPath expression. Any parse or evaluation error is INVALID_EXPRESSION. */
export function query(input: unknown, expression: string): unknown {
  let result: unknown;
  try {
    result = jmespath.search(input, expression);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("INVALID_EXPRESSION", `JMESPath: ${message}`, { expression });
  }
  return result === undefined ? null : result;
}

// ---------------------------------------------------------------------------
// pointer
// ---------------------------------------------------------------------------

const unescapeToken = (token: string): string => token.replace(/~1/g, "/").replace(/~0/g, "~");
const escapeToken = (token: string): string => token.replace(/~/g, "~0").replace(/\//g, "~1");

/** Resolve an RFC 6901 JSON Pointer. "" is the whole document; "/a/0/b~1c" walks keys and indices. */
export function pointer(input: unknown, ptr: string): unknown {
  if (ptr === "") return input;
  if (!ptr.startsWith("/")) {
    fail("INVALID_POINTER", `Pointer must be "" or start with "/", got "${ptr}"`, { pointer: ptr });
  }
  const tokens = ptr.slice(1).split("/").map(unescapeToken);
  let current: unknown = input;
  const resolved: string[] = [];
  for (const token of tokens) {
    let next: unknown;
    let found = false;
    if (Array.isArray(current)) {
      if (/^(0|[1-9][0-9]*)$/.test(token)) {
        const index = Number(token);
        found = index < current.length;
        next = current[index];
      }
    } else if (isPlainObject(current)) {
      found = Object.prototype.hasOwnProperty.call(current, token);
      next = current[token];
    }
    if (!found) {
      const deepest = resolved.length ? "/" + resolved.map(escapeToken).join("/") : "";
      fail("NOT_FOUND", `Pointer "${ptr}" does not exist; deepest existing path is "${deepest}"`, {
        pointer: ptr,
        deepestExisting: deepest,
        missingToken: token,
      });
    }
    resolved.push(token);
    current = next;
  }
  return current;
}

// ---------------------------------------------------------------------------
// diff / patch
// ---------------------------------------------------------------------------

/** RFC 6902 operations that transform `from` into `to`. */
export function diff(from: unknown, to: unknown): Operation[] {
  return jsonpatch.compare(from as object, to as object);
}

/** Apply RFC 6902 operations to a deep clone of `input`; the original is never mutated. */
export function patch(input: unknown, operations: Operation[]): unknown {
  let document = structuredClone(input);
  // One operation at a time so the reported index is ours (the library's is unreliable).
  operations.forEach((operation, index) => {
    try {
      document = jsonpatch.applyOperation(document, operation, true, true, true, index).newDocument;
    } catch (error) {
      const message = (error as Error).message.split("\n")[0];
      fail("PATCH_FAILED", `Operation ${index} (${operation.op} ${operation.path}): ${message}`, {
        code: (error as Error).name,
        index,
        operation,
      });
    }
  });
  return document;
}

// ---------------------------------------------------------------------------
// format / minify / sortKeys / parseJsonc
// ---------------------------------------------------------------------------

/** Recursively sort object keys by UTF-16 code unit order. Arrays keep their order. */
export function sortKeys(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sortKeys);
  if (!isPlainObject(input)) return input;
  const keys = Object.keys(input).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  // Object.fromEntries defines own data properties, so a "__proto__" key stays a plain key.
  return Object.fromEntries(keys.map((k) => [k, sortKeys(input[k])]));
}

/** Pretty-print with `indent` spaces (0 = single line); optionally sort keys first. */
export function format(input: unknown, indent = 2, sort = false): string {
  const value = sort ? sortKeys(input) : input;
  return indent === 0 ? JSON.stringify(value) : JSON.stringify(value, null, indent);
}

/** Parse JSON text and re-serialize it with no whitespace. */
export function minify(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("PARSE_ERROR", message);
  }
  return JSON.stringify(parsed);
}

/** Parse JSON with // and /* comments and trailing commas (tsconfig / VS Code settings style). */
export function parseJsonc(input: string): unknown {
  const errors: ParseError[] = [];
  const value: unknown = jsoncParse(input, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const first = errors[0];
    const name = printParseErrorCode(first.error);
    return fail("PARSE_ERROR", `${name} at offset ${first.offset}`, {
      code: name,
      offset: first.offset,
      length: first.length,
      errorCount: errors.length,
    });
  }
  return value;
}

// ---------------------------------------------------------------------------
// validateSchema
// ---------------------------------------------------------------------------

export interface SchemaError {
  /** JSON Pointer into the instance ("" is the root). */
  path: string;
  message: string;
  keyword: string;
}

export interface SchemaResult {
  valid: boolean;
  errors: SchemaError[];
}

/** A JSON Schema document as plain parsed JSON (or the boolean schemas `true` / `false`). */
export type JsonSchema = Record<string, unknown> | boolean;

/** Pick the draft from `$schema`; default to 2020-12. */
function draftOf(schema: JsonSchema): SchemaDraft {
  const id = typeof schema === "object" && typeof schema.$schema === "string" ? schema.$schema : "";
  if (id.includes("draft-04")) return "4";
  if (id.includes("draft-07")) return "7";
  if (id.includes("2019-09")) return "2019-09";
  return "2020-12";
}

/** Validate a value against a JSON Schema. Invalid data is a result, not an error. */
export function validateSchema(input: unknown, schema: JsonSchema): SchemaResult {
  let validator: Validator;
  try {
    validator = new Validator(schema as Schema, draftOf(schema), false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("INVALID_SCHEMA", message);
  }
  try {
    const result = validator.validate(input);
    return {
      valid: result.valid,
      errors: result.errors.map((e) => ({
        path: e.instanceLocation.replace(/^#/, ""),
        message: e.error,
        keyword: e.keyword,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("INVALID_SCHEMA", message);
  }
}

// ---------------------------------------------------------------------------
// definitions
// ---------------------------------------------------------------------------

const operationSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]).describe("Operation kind"),
  path: z.string().describe("JSON Pointer to the target location"),
  value: z.unknown().optional().describe("Value for add, replace, and test"),
  from: z.string().optional().describe("Source JSON Pointer for move and copy"),
});

export const functions = [
  defineFunction({
    name: "json/query",
    description:
      "Evaluate a JMESPath `expression` against a JSON value `input` (e.g. `users[?age > `30`].name`, `sort_by(items, &price)[0]`). Returns the selected value, or null when nothing matches.",
    input: z.object({
      input: jsonValue("JSON value to query"),
      expression: z.string().min(1).describe("JMESPath expression"),
    }),
    returns: "the selected value (null when the path yields nothing)",
    tags: ["json", "jmespath", "query", "select", "filter", "path"],
    examples: [
      {
        description: "Filter and project",
        input: {
          input: {
            users: [
              { name: "ann", age: 31 },
              { name: "bob", age: 25 },
            ],
          },
          expression: "users[?age > `30`].name",
        },
        output: ["ann"],
      },
      { description: "Missing key", input: { input: { a: 1 }, expression: "b" }, output: null },
    ],
    run: (a) => query(a.input, a.expression),
  }),
  defineFunction({
    name: "json/pointer",
    description:
      'Look up an RFC 6901 JSON Pointer such as `/users/0/name` in a JSON value. `""` returns the whole document; `~1` and `~0` escape `/` and `~` inside keys.',
    input: z.object({
      input: jsonValue("JSON value to address into"),
      pointer: z.string().describe('JSON Pointer, e.g. "/a/0/b" (empty string for the root)'),
    }),
    returns: "the value at the pointer",
    tags: ["json", "pointer", "rfc6901", "path", "get", "lookup"],
    examples: [
      {
        description: "Nested array element",
        input: { input: { users: [{ name: "ann" }] }, pointer: "/users/0/name" },
        output: "ann" as unknown,
      },
      {
        description: "Escaped slash in key",
        input: { input: { "a/b": { "c~d": 5 } }, pointer: "/a~1b/c~0d" },
        output: 5,
      },
    ],
    run: (a) => pointer(a.input, a.pointer),
  }),
  defineFunction({
    name: "json/diff",
    description:
      "Compute the RFC 6902 JSON Patch (add/remove/replace operations) that turns `from` into `to`. Feed the result to json/patch to apply it elsewhere.",
    input: z.object({
      from: jsonValue("Original JSON value"),
      to: jsonValue("Target JSON value"),
    }),
    returns: "array of {op, path, value?} operations",
    tags: ["json", "diff", "patch", "rfc6902", "compare", "changes"],
    examples: [
      {
        description: "Changed field and appended item",
        input: { from: { a: 1, b: [1] }, to: { a: 2, b: [1, 2] } },
        output: [
          { op: "add", path: "/b/1", value: 2 },
          { op: "replace", path: "/a", value: 2 },
        ],
      },
      { description: "No changes", input: { from: { a: 1 }, to: { a: 1 } }, output: [] },
    ],
    run: (a) => diff(a.from, a.to),
  }),
  defineFunction({
    name: "json/patch",
    description:
      "Apply an RFC 6902 JSON Patch (`operations`: add, remove, replace, move, copy, test) to a JSON value and return the new document. The input is never mutated; a failing operation rejects the whole patch.",
    input: z.object({
      input: jsonValue("JSON value to patch"),
      operations: z.array(operationSchema).describe("Ordered list of patch operations"),
    }),
    returns: "the patched JSON value",
    tags: ["json", "patch", "rfc6902", "apply", "update", "modify"],
    examples: [
      {
        description: "Replace and add",
        input: {
          input: { a: 1, tags: ["x"] },
          operations: [
            { op: "replace", path: "/a", value: 2 },
            { op: "add", path: "/tags/-", value: "y" },
          ],
        },
        output: { a: 2, tags: ["x", "y"] },
      },
    ],
    run: (a) => patch(a.input, a.operations as Operation[]),
  }),
  defineFunction({
    name: "json/format",
    description:
      "Pretty-print a JSON value as text with `indent` spaces per level (0 for a single line). Set `sortKeys` to order object keys recursively for stable, diffable output.",
    input: z.object({
      input: jsonValue("JSON value to serialize"),
      indent: z.number().int().min(0).max(8).default(2).describe("Spaces per level (0–8)"),
      sortKeys: z.boolean().default(false).describe("Sort object keys recursively"),
    }),
    returns: "formatted JSON text",
    tags: ["json", "format", "pretty", "stringify", "indent", "print"],
    examples: [
      {
        description: "Two-space indent",
        input: { input: { b: 1, a: [true] } },
        output: '{\n  "b": 1,\n  "a": [\n    true\n  ]\n}',
      },
      {
        description: "Sorted, single line",
        input: { input: { b: 1, a: 2 }, indent: 0, sortKeys: true },
        output: '{"a":2,"b":1}',
      },
    ],
    run: (a) => format(a.input, a.indent, a.sortKeys),
  }),
  defineFunction({
    name: "json/minify",
    description:
      "Parse JSON text and re-serialize it with all insignificant whitespace removed. Also a strict validity check: malformed text fails with PARSE_ERROR.",
    input: z.object({ input: z.string().describe("JSON text") }),
    returns: "compact JSON text",
    tags: ["json", "minify", "compact", "strip", "whitespace", "validate"],
    examples: [
      {
        description: "Strip whitespace",
        input: { input: '{ "a": [1, 2],\n "b": null }' },
        output: '{"a":[1,2],"b":null}',
      },
    ],
    run: (a) => minify(a.input),
  }),
  defineFunction({
    name: "json/sortKeys",
    description:
      "Return a copy of a JSON value with every object's keys sorted (code-unit order) at all depths. Array order is preserved. Useful for canonical comparison and stable diffs.",
    input: z.object({ input: jsonValue("JSON value to canonicalize") }),
    returns: "the same value with object keys sorted recursively",
    tags: ["json", "sort", "keys", "canonical", "normalize", "stable"],
    examples: [
      {
        description: "Nested objects and arrays",
        input: { input: { b: { z: 1, y: 2 }, a: [{ d: 1, c: 2 }] } },
        output: { a: [{ c: 2, d: 1 }], b: { y: 2, z: 1 } },
      },
    ],
    run: (a) => sortKeys(a.input),
  }),
  defineFunction({
    name: "json/parseJsonc",
    description:
      "Parse JSON that may contain `//` and `/* */` comments and trailing commas, as found in tsconfig.json, .eslintrc, and VS Code settings.json. Returns the plain JSON value.",
    input: z.object({ input: z.string().describe("JSONC text") }),
    returns: "the parsed JSON value",
    tags: ["json", "jsonc", "comments", "parse", "tsconfig", "settings"],
    examples: [
      {
        description: "Comments and trailing commas",
        input: { input: '{\n  // compiler\n  "strict": true, /* yes */\n  "lib": ["es2022",],\n}' },
        output: { strict: true, lib: ["es2022"] },
      },
    ],
    run: (a) => parseJsonc(a.input),
  }),
  defineFunction({
    name: "json/validateSchema",
    description:
      "Validate a JSON value `input` against a JSON Schema `schema` (draft 2020-12 by default; draft-07/04 and 2019-09 are honored via `$schema`). Invalid data returns `valid: false` with per-path errors rather than failing.",
    input: z.object({
      input: jsonValue("JSON value to validate"),
      schema: z
        .union([z.record(z.string(), z.unknown()), z.boolean()])
        .describe("JSON Schema object (or boolean schema)"),
    }),
    returns:
      "{ valid, errors: [{ path, message, keyword }] } where path is a JSON Pointer into input",
    tags: ["json", "schema", "validate", "jsonschema", "check", "conform"],
    examples: [
      {
        description: "Valid document",
        input: {
          input: { name: "ann", age: 31 },
          schema: { type: "object", required: ["name"], properties: { age: { type: "integer" } } },
        },
        output: { valid: true, errors: [] },
      },
      {
        description: "Wrong type",
        input: {
          input: { age: "x" },
          schema: { type: "object", properties: { age: { type: "integer" } } },
        },
        output: {
          valid: false,
          errors: [
            { path: "", message: 'Property "age" does not match schema.', keyword: "properties" },
            {
              path: "/age",
              message: 'Instance type "string" is invalid. Expected "integer".',
              keyword: "type",
            },
          ],
        },
      },
    ],
    run: (a) => validateSchema(a.input, a.schema as JsonSchema),
  }),
];
