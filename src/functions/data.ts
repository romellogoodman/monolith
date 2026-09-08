/**
 * data/* — array and object helpers over plain JSON values. Objects are
 * treated as data, so prototype names (`__proto__`, `constructor`) are safe
 * as keys and values.
 */

import { z } from "zod";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

type Json = unknown;
type Obj = Record<string, unknown>;
type Container = Obj | unknown[];

const anyArray = (description: string) => z.array(z.unknown()).describe(description);
const objectArray = (description: string) =>
  z.array(z.record(z.string(), z.unknown())).describe(description);
const anyObject = (description: string) => z.record(z.string(), z.unknown()).describe(description);
const pathSchema = z
  .union([z.string(), z.array(z.string())])
  .describe('Dot/bracket path like "a.b[0].c", or an array of keys for keys containing dots');

/** Longest array `range` will build; anything larger is rejected with TOO_LARGE. */
export const MAX_RANGE_LENGTH = 100_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic JSON serialization with sorted object keys, used for structural equality. */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Obj)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Set an own, enumerable property without touching the prototype (safe for "__proto__"). */
export function setOwn(target: Obj, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

const isPlainObject = (value: unknown): value is Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isContainer = (value: unknown): value is Container =>
  value !== null && typeof value === "object";
const isIndex = (segment: string): boolean => /^(0|[1-9]\d*)$/.test(segment);

/** Deep copy of a JSON value; own keys only, so "__proto__" stays a plain data key. */
export function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  if (isPlainObject(value)) {
    const out: Obj = {};
    for (const key of Object.keys(value)) setOwn(out, key, cloneJson(value[key]));
    return out as T;
  }
  return value;
}

/** Name of the bucket a value lands in: strings as-is, missing as "undefined", else canonical JSON. */
function bucketName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  return canonicalJson(value);
}

/**
 * Split a path into key segments. `"a.b[0].c"`, `"a.b.0.c"`, and `'a["b"][0].c'`
 * all become `["a", "b", "0", "c"]`. An array is used as-is (for keys that
 * contain dots or brackets).
 */
export function parsePath(path: string | string[]): string[] {
  if (Array.isArray(path)) return path;
  return path
    .replace(/\[(?:"([^"]*)"|'([^']*)'|([^\]]*))\]/g, (_, dq, sq, bare) => `.${dq ?? sq ?? bare}`)
    .split(".")
    .filter((segment) => segment !== "");
}

const readOwn = (container: Container, key: string): unknown =>
  Array.isArray(container)
    ? container[Number(key)]
    : Object.hasOwn(container, key)
      ? container[key]
      : undefined;

function writeOwn(container: Container, key: string, value: unknown): void {
  if (Array.isArray(container)) container[Number(key)] = value;
  else setOwn(container, key, value);
}

/**
 * Mutating path assignment used by `set` and `unflattenKeys`. Missing (or
 * null) intermediates are created: an array when the next segment is a
 * non-negative integer, otherwise an object. Descending through a primitive,
 * or using a non-index key on an array, is an INVALID_PATH error.
 */
function setPath(root: Container, segments: string[], value: unknown): void {
  if (segments.length === 0) fail("INVALID_PATH", "Path must contain at least one key");
  let current: Container = root;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const here = segments.slice(0, i + 1).join(".");
    if (Array.isArray(current)) {
      if (!isIndex(segment)) {
        fail(
          "INVALID_PATH",
          `"${here}" indexes an array but "${segment}" is not a non-negative integer`
        );
      }
      while (current.length < Number(segment)) current.push(null);
    }
    if (i === segments.length - 1) {
      writeOwn(current, segment, value);
      return;
    }
    let next = readOwn(current, segment);
    if (next === undefined || next === null) {
      next = isIndex(segments[i + 1]) ? [] : {};
      writeOwn(current, segment, next);
    } else if (!isContainer(next)) {
      fail("INVALID_PATH", `Cannot descend into ${typeof next} value at "${here}"`);
    }
    current = next as Container;
  }
}

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

/** Deduplicate by structural equality: objects and arrays compare by content, not reference. */
export function unique(array: Json[]): Json[] {
  const seen = new Set<string>();
  const out: Json[] = [];
  for (const item of array) {
    const key = canonicalJson(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * Total ordering over JSON values so sorting is deterministic even with mixed
 * or missing keys: numbers < strings < booleans < arrays/objects (by canonical
 * JSON) < null < missing/undefined/NaN. Within a type, natural order.
 */
export function compareValues(a: unknown, b: unknown): number {
  const rank = (v: unknown): number => {
    if (v === undefined || (typeof v === "number" && Number.isNaN(v))) return 6;
    if (v === null) return 5;
    if (typeof v === "number") return 0;
    if (typeof v === "string") return 1;
    if (typeof v === "boolean") return 2;
    return 3;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (a as number) - (b as number);
  if (ra === 1) return a === b ? 0 : (a as string) < (b as string) ? -1 : 1;
  if (ra === 2) return Number(a) - Number(b);
  if (ra === 3) {
    const ca = canonicalJson(a);
    const cb = canonicalJson(b);
    return ca === cb ? 0 : ca < cb ? -1 : 1;
  }
  return 0;
}

const isMissing = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "number" && Number.isNaN(v));

/**
 * Stable sort by `key`. Missing, null, and NaN values always sort last
 * (SQL "NULLS LAST"), whichever direction is requested.
 */
export function sortBy(array: Obj[], key: string, direction: "asc" | "desc" = "asc"): Obj[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...array].sort((a, b) => {
    const ma = isMissing(a[key]);
    const mb = isMissing(b[key]);
    if (ma || mb) return ma === mb ? 0 : ma ? 1 : -1;
    return sign * compareValues(a[key], b[key]);
  });
}

/** Group by the stringified value of `key`; missing keys group under "undefined". */
export function groupBy(array: Obj[], key: string): Record<string, Obj[]> {
  const groups = new Map<string, Obj[]>();
  for (const item of array) {
    const name = bucketName(item[key]);
    const bucket = groups.get(name);
    if (bucket) bucket.push(item);
    else groups.set(name, [item]);
  }
  const out: Record<string, Obj[]> = {};
  for (const [name, items] of groups) setOwn(out, name, items);
  return out;
}

/** Count items per distinct value of `key`, named the same way `groupBy` names its buckets. */
export function countBy(array: Obj[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of array) {
    const name = bucketName(item[key]);
    setOwn(out, name, (Object.hasOwn(out, name) ? (out[name] as number) : 0) + 1);
  }
  return out;
}

/** Index items by the value of `key`; when several share a value, the last one wins. */
export function keyBy(array: Obj[], key: string): Record<string, Obj> {
  const out: Record<string, Obj> = {};
  for (const item of array) setOwn(out, bucketName(item[key]), item);
  return out;
}

export const flatten = (array: Json[], depth?: number): Json[] => array.flat(depth ?? Infinity);

/** Split into consecutive groups of `size`; the last group holds the remainder. */
export function chunk(array: Json[], size: number): Json[][] {
  if (!Number.isInteger(size) || size < 1)
    fail("INVALID_SIZE", "Chunk size must be an integer >= 1");
  const out: Json[][] = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

/** Pair items by position. The result is as long as the longer input; the shorter is padded with null. */
export function zip(a: Json[], b: Json[]): Array<[Json, Json]> {
  const length = Math.max(a.length, b.length);
  return Array.from({ length }, (_, i) => [i < a.length ? a[i] : null, i < b.length ? b[i] : null]);
}

/** Items of `a` that also appear in `b` (structurally), deduplicated, in `a`'s order. */
export function intersection(a: Json[], b: Json[]): Json[] {
  const inB = new Set(b.map(canonicalJson));
  return unique(a).filter((item) => inB.has(canonicalJson(item)));
}

/** Items of `a` that do not appear in `b` (structurally), in `a`'s order, duplicates kept. */
export function difference(a: Json[], b: Json[]): Json[] {
  const inB = new Set(b.map(canonicalJson));
  return a.filter((item) => !inB.has(canonicalJson(item)));
}

/** Numbers from `start` up to but excluding `end`, stepping by `step`. Empty when the step points away from `end`. */
export function range(start: number, end: number, step = 1): number[] {
  if (step === 0) fail("INVALID_STEP", "Step must not be 0");
  const length = Math.max(0, Math.ceil((end - start) / step));
  if (length > MAX_RANGE_LENGTH) {
    fail("TOO_LARGE", `Range would have ${length} items; the limit is ${MAX_RANGE_LENGTH}`, {
      length,
      limit: MAX_RANGE_LENGTH,
    });
  }
  return Array.from({ length }, (_, i) => start + i * step);
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

export function pick(object: Obj, keys: string[]): Obj {
  const out: Obj = {};
  for (const key of keys) if (Object.hasOwn(object, key)) setOwn(out, key, object[key]);
  return out;
}

export function omit(object: Obj, keys: string[]): Obj {
  const drop = new Set(keys);
  const out: Obj = {};
  for (const key of Object.keys(object)) if (!drop.has(key)) setOwn(out, key, object[key]);
  return out;
}

/** Read the value at `path`, or `fallback` when any segment is missing. Own properties only. */
export function get(object: Obj, path: string | string[], fallback?: unknown): unknown {
  let current: unknown = object;
  for (const segment of parsePath(path)) {
    if (!isContainer(current) || !Object.hasOwn(current, segment)) return fallback;
    if (Array.isArray(current) && !isIndex(segment)) return fallback;
    current = (current as Obj)[segment];
  }
  return current;
}

/** Return a deep copy of `object` with `value` written at `path`; the input is never mutated. */
export function set(object: Obj, path: string | string[], value: unknown): Obj {
  const out = cloneJson(object);
  setPath(out, parsePath(path), cloneJson(value));
  return out;
}

function mergeInto(target: Obj, source: Obj): void {
  for (const key of Object.keys(source)) {
    const incoming = source[key];
    const existing = Object.hasOwn(target, key) ? target[key] : undefined;
    if (isPlainObject(incoming) && isPlainObject(existing)) mergeInto(existing, incoming);
    else setOwn(target, key, cloneJson(incoming));
  }
}

/**
 * Recursively merge each source into a copy of `target`, left to right.
 * Nested objects merge; arrays and primitives are replaced by the later value.
 * Only own keys are read and written, so nothing reaches a prototype.
 */
export function deepMerge(target: Obj, sources: Obj[]): Obj {
  const out = cloneJson(target);
  for (const source of sources) mergeInto(out, source);
  return out;
}

/** Collapse nesting into one level of `separator`-joined keys; array positions become index segments. */
export function flattenKeys(object: Obj, separator = "."): Obj {
  const out: Obj = {};
  const walk = (value: unknown, prefix: string): void => {
    if (isContainer(value)) {
      const keys = Array.isArray(value) ? value.map((_, i) => String(i)) : Object.keys(value);
      if (keys.length > 0) {
        for (const key of keys) walk((value as Obj)[key], `${prefix}${separator}${key}`);
        return;
      }
    }
    setOwn(out, prefix, value);
  };
  for (const key of Object.keys(object)) walk(object[key], key);
  return out;
}

/** Inverse of `flattenKeys`: rebuild nesting from joined keys; integer segments rebuild arrays. */
export function unflattenKeys(object: Obj, separator = "."): Obj {
  const out: Obj = {};
  for (const key of Object.keys(object)) {
    setPath(out, key.split(separator), cloneJson(object[key]));
  }
  return out;
}

/** Structural equality of two JSON values; object key order is irrelevant. */
export const deepEqual = (a: Json, b: Json): boolean => canonicalJson(a) === canonicalJson(b);

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const functions = [
  defineFunction({
    name: "data/arrays/unique",
    description:
      "Remove duplicate values from an array, keeping first occurrences. Objects and arrays are compared by content, so [{a:1},{a:1}] dedupes to one item.",
    input: z.object({ array: anyArray("Array to deduplicate") }),
    returns: "array with duplicates removed, original order kept",
    tags: ["data", "array", "unique", "dedupe", "distinct"],
    examples: [
      { description: "Numbers", input: { array: [1, 2, 2, 3] }, output: [1, 2, 3] },
      {
        description: "Objects by content",
        input: { array: [{ a: 1 }, { a: 1 }] },
        output: [{ a: 1 }],
      },
    ],
    run: (a) => unique(a.array),
  }),
  defineFunction({
    name: "data/arrays/sortBy",
    description:
      "Sort an array of objects by one key, stably. Mixed types sort deterministically (numbers, then strings, then booleans, then objects); null and missing values always sort last, in either direction.",
    input: z.object({
      array: objectArray("Array of objects to sort"),
      key: z.string().describe("Property to sort by"),
      direction: z.enum(["asc", "desc"]).default("asc").describe("Sort direction"),
    }),
    returns: "new sorted array",
    tags: ["data", "array", "sort", "order", "by"],
    examples: [
      {
        description: "Ascending",
        input: { array: [{ age: 30 }, { age: 25 }], key: "age" },
        output: [{ age: 25 }, { age: 30 }],
      },
      {
        description: "Descending with a missing key last",
        input: { array: [{ n: 1 }, {}, { n: 3 }], key: "n", direction: "desc" },
        output: [{ n: 3 }, { n: 1 }, {}],
      },
    ],
    run: (a) => sortBy(a.array, a.key, a.direction),
  }),
  defineFunction({
    name: "data/arrays/groupBy",
    description: "Group an array of objects into buckets keyed by the value of `key`.",
    input: z.object({
      array: objectArray("Array of objects to group"),
      key: z.string().describe("Property whose value names each group"),
    }),
    returns: "object mapping each value to the array of items with that value",
    tags: ["data", "array", "group", "bucket", "partition"],
    examples: [
      {
        description: "By kind",
        input: {
          array: [
            { kind: "a", n: 1 },
            { kind: "b", n: 2 },
            { kind: "a", n: 3 },
          ],
          key: "kind",
        },
        output: {
          a: [
            { kind: "a", n: 1 },
            { kind: "a", n: 3 },
          ],
          b: [{ kind: "b", n: 2 }],
        },
      },
    ],
    run: (a) => groupBy(a.array, a.key),
  }),
  defineFunction({
    name: "data/arrays/countBy",
    description:
      'Count how many objects share each value of `key`. Non-string values are named by their JSON; missing keys count under "undefined".',
    input: z.object({
      array: objectArray("Array of objects to count"),
      key: z.string().describe("Property whose value names each count"),
    }),
    returns: "object mapping each value to the number of items with that value",
    tags: ["data", "array", "count", "tally", "frequency", "histogram"],
    examples: [
      {
        description: "By kind",
        input: { array: [{ kind: "a" }, { kind: "b" }, { kind: "a" }], key: "kind" },
        output: { a: 2, b: 1 },
      },
    ],
    run: (a) => countBy(a.array, a.key),
  }),
  defineFunction({
    name: "data/arrays/keyBy",
    description:
      "Index an array of objects by the value of `key`, producing a lookup object. When several items share a value, the last one wins.",
    input: z.object({
      array: objectArray("Array of objects to index"),
      key: z.string().describe("Property whose value becomes the lookup key"),
    }),
    returns: "object mapping each value to the last item with that value",
    tags: ["data", "array", "index", "lookup", "keyBy", "map"],
    examples: [
      {
        description: "By id",
        input: {
          array: [
            { id: "x", n: 1 },
            { id: "y", n: 2 },
          ],
          key: "id",
        },
        output: { x: { id: "x", n: 1 }, y: { id: "y", n: 2 } },
      },
      {
        description: "Later item wins",
        input: {
          array: [
            { id: 1, n: "old" },
            { id: 1, n: "new" },
          ],
          key: "id",
        },
        output: { "1": { id: 1, n: "new" } },
      },
    ],
    run: (a) => keyBy(a.array, a.key),
  }),
  defineFunction({
    name: "data/arrays/flatten",
    description: "Flatten nested arrays to a given depth, or completely when `depth` is omitted.",
    input: z.object({
      array: anyArray("Nested array"),
      depth: z.number().int().nonnegative().optional().describe("Levels to flatten; omit for all"),
    }),
    returns: "flattened array",
    tags: ["data", "array", "flatten", "nested", "flat"],
    examples: [
      { description: "Fully", input: { array: [1, [2, [3, [4]]]] }, output: [1, 2, 3, 4] },
      { description: "One level", input: { array: [1, [2, [3]]], depth: 1 }, output: [1, 2, [3]] },
    ],
    run: (a) => flatten(a.array, a.depth),
  }),
  defineFunction({
    name: "data/arrays/chunk",
    description:
      "Split an array into consecutive groups of `size`. The last group holds whatever remains.",
    input: z.object({
      array: anyArray("Array to split"),
      size: z.number().int().min(1).describe("Items per group"),
    }),
    returns: "array of arrays, each of length `size` except possibly the last",
    tags: ["data", "array", "chunk", "batch", "split", "partition"],
    examples: [
      {
        description: "Uneven",
        input: { array: [1, 2, 3, 4, 5], size: 2 },
        output: [[1, 2], [3, 4], [5]],
      },
      { description: "Empty", input: { array: [], size: 3 }, output: [] },
    ],
    run: (a) => chunk(a.array, a.size),
  }),
  defineFunction({
    name: "data/arrays/zip",
    description:
      "Pair up two arrays by position into [a[i], b[i]] tuples. The result is as long as the longer input; the shorter one is padded with null.",
    input: z.object({ a: anyArray("First array"), b: anyArray("Second array") }),
    returns: "array of two-element arrays",
    tags: ["data", "array", "zip", "pair", "tuple", "combine"],
    examples: [
      {
        description: "Equal lengths",
        input: { a: ["x", "y"], b: [1, 2] },
        output: [
          ["x", 1],
          ["y", 2],
        ],
      },
      {
        description: "Shorter side padded",
        input: { a: [1, 2, 3], b: ["a"] },
        output: [
          [1, "a"],
          [2, null],
          [3, null],
        ],
      },
    ],
    run: (a) => zip(a.a, a.b),
  }),
  defineFunction({
    name: "data/arrays/intersection",
    description:
      "Values present in both arrays, compared by content (objects and arrays included). Keeps `a`'s order and drops duplicates.",
    input: z.object({ a: anyArray("First array"), b: anyArray("Second array") }),
    returns: "array of values found in both inputs",
    tags: ["data", "array", "intersection", "common", "set", "both"],
    examples: [
      { description: "Numbers", input: { a: [1, 2, 2, 3], b: [2, 3, 4] }, output: [2, 3] },
      {
        description: "Objects",
        input: { a: [{ id: 1 }, { id: 2 }], b: [{ id: 2 }] },
        output: [{ id: 2 }],
      },
    ],
    run: (a) => intersection(a.a, a.b),
  }),
  defineFunction({
    name: "data/arrays/difference",
    description:
      "Values in `a` that do not appear in `b`, compared by content. Keeps `a`'s order and duplicates.",
    input: z.object({ a: anyArray("Array to filter"), b: anyArray("Values to exclude") }),
    returns: "array of values from `a` not found in `b`",
    tags: ["data", "array", "difference", "exclude", "set", "minus", "without"],
    examples: [
      { description: "Numbers", input: { a: [1, 2, 3, 2], b: [2] }, output: [1, 3] },
      { description: "Nothing excluded", input: { a: ["x"], b: [] }, output: ["x"] },
    ],
    run: (a) => difference(a.a, a.b),
  }),
  defineFunction({
    name: "data/arrays/range",
    description:
      "Numbers from `start` up to but not including `end`, in increments of `step` (default 1; may be negative or fractional). At most 100,000 items.",
    input: z.object({
      start: z.number().describe("First value (inclusive)"),
      end: z.number().describe("Stop value (exclusive)"),
      step: z.number().default(1).describe("Increment; negative counts down, must not be 0"),
    }),
    returns: "array of numbers",
    tags: ["data", "array", "range", "sequence", "numbers", "iota"],
    examples: [
      { description: "0 to 5", input: { start: 0, end: 5 }, output: [0, 1, 2, 3, 4] },
      { description: "Counting down", input: { start: 3, end: 0, step: -1 }, output: [3, 2, 1] },
      {
        description: "Fractional step",
        input: { start: 0, end: 1, step: 0.25 },
        output: [0, 0.25, 0.5, 0.75],
      },
    ],
    run: (a) => range(a.start, a.end, a.step),
  }),
  defineFunction({
    name: "data/objects/pick",
    description:
      "Copy only the listed keys from an object. Keys absent from the source are skipped.",
    input: z.object({
      object: anyObject("Source object"),
      keys: z.array(z.string()).describe("Keys to keep"),
    }),
    returns: "new object with only those keys",
    tags: ["data", "object", "pick", "subset", "select"],
    examples: [
      {
        description: "Two keys",
        input: { object: { a: 1, b: 2, c: 3 }, keys: ["a", "b"] },
        output: { a: 1, b: 2 },
      },
    ],
    run: (a) => pick(a.object, a.keys),
  }),
  defineFunction({
    name: "data/objects/omit",
    description: "Copy an object without the listed keys.",
    input: z.object({
      object: anyObject("Source object"),
      keys: z.array(z.string()).describe("Keys to drop"),
    }),
    returns: "new object without those keys",
    tags: ["data", "object", "omit", "exclude", "remove"],
    examples: [
      { description: "Drop one", input: { object: { a: 1, b: 2 }, keys: ["b"] }, output: { a: 1 } },
    ],
    run: (a) => omit(a.object, a.keys),
  }),
  defineFunction({
    name: "data/objects/get",
    description:
      'Read a nested value by path, e.g. "a.b[0].c" or ["a", "b", "0", "c"]. Returns `default` (or nothing) when any part of the path is missing.',
    input: z.object({
      object: anyObject("Object to read from"),
      path: pathSchema,
      default: z.unknown().optional().describe("Value to return when the path is missing"),
    }),
    returns: "the value at the path, or `default`",
    tags: ["data", "object", "get", "path", "nested", "lookup", "dig"],
    examples: [
      {
        description: "Bracket index",
        input: { object: { a: { b: [{ c: 42 }] } }, path: "a.b[0].c" },
        output: 42 as unknown,
      },
      {
        description: "Missing with default",
        input: { object: { a: 1 }, path: "a.b", default: "none" },
        output: "none",
      },
    ],
    run: (a) => get(a.object, a.path, a.default),
  }),
  defineFunction({
    name: "data/objects/set",
    description:
      "Return a copy of the object with `value` written at `path`, creating intermediate objects (or arrays, for numeric segments) as needed. The input is not modified.",
    input: z.object({
      object: anyObject("Object to copy and update"),
      path: pathSchema,
      value: z.unknown().describe("Value to write"),
    }),
    returns: "new object with the value in place",
    tags: ["data", "object", "set", "path", "nested", "assign", "immutable"],
    examples: [
      {
        description: "Existing path",
        input: { object: { a: { b: 1 } }, path: "a.b", value: 2 },
        output: { a: { b: 2 } },
      },
      {
        description: "Creates intermediates",
        input: { object: {}, path: "items[0].name", value: "x" },
        output: { items: [{ name: "x" }] },
      },
    ],
    run: (a) => set(a.object, a.path, a.value),
  }),
  defineFunction({
    name: "data/objects/deepMerge",
    description:
      "Recursively merge `sources` into `target`, left to right, returning a new object. Nested objects combine; arrays and primitives are replaced by the later value.",
    input: z.object({
      target: anyObject("Base object"),
      sources: z
        .array(anyObject("Object to merge in"))
        .describe("Objects merged in order; later ones win"),
    }),
    returns: "new merged object",
    tags: ["data", "object", "merge", "deep", "extend", "defaults", "combine"],
    examples: [
      {
        description: "Nested merge, array replaced",
        input: {
          target: { a: { x: 1, list: [1, 2] }, b: 1 },
          sources: [{ a: { y: 2, list: [3] } }],
        },
        output: { a: { x: 1, list: [3], y: 2 }, b: 1 },
      },
    ],
    run: (a) => deepMerge(a.target, a.sources),
  }),
  defineFunction({
    name: "data/objects/flattenKeys",
    description:
      'Flatten a nested object into a single level with joined keys, e.g. {a:{b:[1]}} → {"a.b.0": 1}. Empty objects and arrays are kept as leaf values.',
    input: z.object({
      object: anyObject("Nested object"),
      separator: z.string().min(1).default(".").describe("String joining key segments"),
    }),
    returns: "single-level object with joined keys",
    tags: ["data", "object", "flatten", "keys", "dot", "path"],
    examples: [
      {
        description: "Objects and arrays",
        input: { object: { a: { b: 1, c: [10, 20] } } },
        output: { "a.b": 1, "a.c.0": 10, "a.c.1": 20 },
      },
    ],
    run: (a) => flattenKeys(a.object, a.separator),
  }),
  defineFunction({
    name: "data/objects/unflattenKeys",
    description:
      'Rebuild a nested object from joined keys, the inverse of flattenKeys: {"a.b.0": 1} → {a:{b:[1]}}. Integer segments become array indexes.',
    input: z.object({
      object: anyObject("Single-level object with joined keys"),
      separator: z.string().min(1).default(".").describe("String separating key segments"),
    }),
    returns: "nested object",
    tags: ["data", "object", "unflatten", "keys", "dot", "path", "nest"],
    examples: [
      {
        description: "Objects and arrays",
        input: { object: { "a.b": 1, "a.c.0": 10, "a.c.1": 20 } },
        output: { a: { b: 1, c: [10, 20] } },
      },
    ],
    run: (a) => unflattenKeys(a.object, a.separator),
  }),
  defineFunction({
    name: "data/objects/deepEqual",
    description:
      "Structural equality of two JSON values: same keys and values at every depth, regardless of key order.",
    input: z.object({
      a: z.unknown().describe("First value"),
      b: z.unknown().describe("Second value"),
    }),
    returns: "true when the values are structurally equal",
    tags: ["data", "object", "equal", "compare", "deep", "same"],
    examples: [
      {
        description: "Key order ignored",
        input: { a: { x: 1, y: [1, 2] }, b: { y: [1, 2], x: 1 } },
        output: true,
      },
      { description: "Different", input: { a: [1, 2], b: [2, 1] }, output: false },
    ],
    run: (a) => deepEqual(a.a, a.b),
  }),
];
