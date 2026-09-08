import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  MAX_RANGE_LENGTH,
  canonicalJson,
  chunk,
  cloneJson,
  compareValues,
  countBy,
  deepEqual,
  deepMerge,
  difference,
  flatten,
  flattenKeys,
  functions,
  get,
  groupBy,
  intersection,
  keyBy,
  omit,
  parsePath,
  pick,
  range,
  set,
  sortBy,
  unflattenKeys,
  unique,
  zip,
} from "../../../src/functions/data.js";

const byName = (name: string) => {
  const fn = functions.find((f) => f.name === name);
  if (!fn) throw new Error(`no function ${name}`);
  return fn;
};

/** Parse JSON so "__proto__" is an own data key rather than a prototype assignment. */
const withProto = (json: string) => JSON.parse(json) as Record<string, unknown>;

const expectClean = (result: object) => {
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect((result as { polluted?: unknown }).polluted).toBeUndefined();
  expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
};

describe("data examples", () => {
  for (const fn of functions) {
    for (const example of fn.examples) {
      it(`${fn.name}: ${example.description}`, () => {
        expect(execute(fn, example.input)).toEqual({ success: true, result: example.output });
      });
    }
  }
});

describe("helpers", () => {
  it("canonicalJson sorts keys and normalizes non-JSON values", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(canonicalJson(undefined)).toBe("null");
    expect(canonicalJson(NaN)).toBe("null");
    expect(canonicalJson("s")).toBe('"s"');
  });

  it("compareValues ranks numbers < strings < booleans < objects < null < missing", () => {
    const ordered = [1, "a", true, { x: 1 }, null, undefined];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareValues(ordered[i], ordered[i + 1])).toBeLessThan(0);
      expect(compareValues(ordered[i + 1], ordered[i])).toBeGreaterThan(0);
    }
    expect(compareValues(NaN, undefined)).toBe(0);
    expect(compareValues(false, true)).toBeLessThan(0);
    expect(compareValues([1], [2])).toBeLessThan(0);
    expect(compareValues("b", "a")).toBeGreaterThan(0);
    expect(compareValues(2, 2)).toBe(0);
  });

  it("cloneJson deep-copies and keeps __proto__ as a data key", () => {
    const source = withProto('{"__proto__": {"polluted": true}, "a": {"b": [1, {"c": 2}]}}');
    const copy = cloneJson(source);
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.a).not.toBe(source.a);
    expect((copy.a as { b: unknown[] }).b).not.toBe((source.a as { b: unknown[] }).b);
    expect(Object.hasOwn(copy, "__proto__")).toBe(true);
    expectClean(copy);
  });

  it("parsePath handles dots, brackets, quotes, and arrays", () => {
    expect(parsePath("a.b[0].c")).toEqual(["a", "b", "0", "c"]);
    expect(parsePath("a.b.0.c")).toEqual(["a", "b", "0", "c"]);
    expect(parsePath("a[\"b c\"]['d']")).toEqual(["a", "b c", "d"]);
    expect(parsePath("")).toEqual([]);
    expect(parsePath(["a.b", "c"])).toEqual(["a.b", "c"]);
  });
});

describe("unique", () => {
  it("dedupes primitives, keeping first occurrences", () => {
    expect(unique([3, 1, 3, "3", 1])).toEqual([3, 1, "3"]);
  });

  it("dedupes objects by content regardless of key order", () => {
    expect(unique([{ a: 1, b: 2 }, { b: 2, a: 1 }, [1, 2], [1, 2], { a: 1 }])).toEqual([
      { a: 1, b: 2 },
      [1, 2],
      { a: 1 },
    ]);
  });

  it("keeps NaN once", () => {
    expect(unique([NaN, 1, NaN])).toEqual([NaN, 1]);
  });

  it("handles empty arrays", () => {
    expect(unique([])).toEqual([]);
  });

  it("rejects a non-array through execute", () => {
    expect(execute(byName("data/arrays/unique"), { array: "nope" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("sortBy", () => {
  it("sorts numbers ascending and descending", () => {
    const items = [{ n: 2 }, { n: 10 }, { n: 1 }];
    expect(sortBy(items, "n")).toEqual([{ n: 1 }, { n: 2 }, { n: 10 }]);
    expect(sortBy(items, "n", "desc")).toEqual([{ n: 10 }, { n: 2 }, { n: 1 }]);
    expect(items).toEqual([{ n: 2 }, { n: 10 }, { n: 1 }]);
  });

  it("puts missing keys last in both directions", () => {
    const items = [{}, { n: 1 }, { n: 3 }, {}];
    expect(sortBy(items, "n", "asc")).toEqual([{ n: 1 }, { n: 3 }, {}, {}]);
    expect(sortBy(items, "n", "desc")).toEqual([{ n: 3 }, { n: 1 }, {}, {}]);
  });

  it("puts null and NaN last in both directions", () => {
    const items = [{ n: null }, { n: 2 }, { n: NaN }, { n: 1 }];
    expect(sortBy(items, "n", "asc")).toEqual([{ n: 1 }, { n: 2 }, { n: null }, { n: NaN }]);
    expect(sortBy(items, "n", "desc")).toEqual([{ n: 2 }, { n: 1 }, { n: null }, { n: NaN }]);
  });

  it("sorts mixed numbers and strings deterministically and stably", () => {
    const items = [
      { v: "b", i: 0 },
      { v: 2, i: 1 },
      { v: "a", i: 2 },
      { v: 1, i: 3 },
      { v: "a", i: 4 },
      { v: true, i: 5 },
    ];
    expect(sortBy(items, "v").map((x) => x.i)).toEqual([3, 1, 2, 4, 0, 5]);
    expect(sortBy(items, "v", "desc").map((x) => x.i)).toEqual([5, 0, 2, 4, 1, 3]);
  });

  it("is stable for equal keys", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ k: i % 3, i }));
    const sorted = sortBy(items, "k");
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1].k === sorted[i].k)
        expect(sorted[i - 1].i).toBeLessThan(sorted[i].i as number);
    }
  });

  it("rejects an unknown direction through execute", () => {
    expect(
      execute(byName("data/arrays/sortBy"), { array: [], key: "n", direction: "up" })
    ).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("groupBy", () => {
  it("groups by string values", () => {
    expect(groupBy([{ t: "x" }, { t: "y" }, { t: "x" }], "t")).toEqual({
      x: [{ t: "x" }, { t: "x" }],
      y: [{ t: "y" }],
    });
  });

  it("uses prototype names as plain keys", () => {
    const out = groupBy(
      [{ k: "constructor" }, { k: "__proto__" }, { k: "toString" }, { k: "__proto__" }],
      "k"
    );
    expect(Object.keys(out)).toEqual(["constructor", "__proto__", "toString"]);
    expect(out.constructor).toEqual([{ k: "constructor" }]);
    expect(out.toString).toEqual([{ k: "toString" }]);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual([
      { k: "__proto__" },
      { k: "__proto__" },
    ]);
    expectClean(out);
  });

  it('groups missing keys under "undefined" and non-strings by their JSON', () => {
    const out = groupBy([{ k: 1 }, {}, { k: null }, { k: true }, { k: { a: 1 } }, {}], "k");
    expect(out).toEqual({
      "1": [{ k: 1 }],
      undefined: [{}, {}],
      null: [{ k: null }],
      true: [{ k: true }],
      '{"a":1}': [{ k: { a: 1 } }],
    });
  });

  it("rejects non-object items through execute", () => {
    expect(execute(byName("data/arrays/groupBy"), { array: [1], key: "k" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("countBy", () => {
  it("counts by value, naming buckets like groupBy", () => {
    expect(countBy([{ k: "a" }, { k: 1 }, { k: "a" }, {}, { k: null }], "k")).toEqual({
      a: 2,
      "1": 1,
      undefined: 1,
      null: 1,
    });
  });

  it("handles prototype names and empty input", () => {
    const out = countBy([{ k: "__proto__" }, { k: "constructor" }, { k: "constructor" }], "k");
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toBe(1);
    expect(out.constructor).toBe(2);
    expectClean(out);
    expect(countBy([], "k")).toEqual({});
  });

  it("rejects a missing key argument through execute", () => {
    expect(execute(byName("data/arrays/countBy"), { array: [] })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("keyBy", () => {
  it("indexes by value with later items winning", () => {
    expect(
      keyBy(
        [
          { id: "a", v: 1 },
          { id: "b", v: 2 },
          { id: "a", v: 3 },
        ],
        "id"
      )
    ).toEqual({
      a: { id: "a", v: 3 },
      b: { id: "b", v: 2 },
    });
  });

  it('names missing keys "undefined" and keeps prototype names as data', () => {
    const out = keyBy([{ x: 1 }, { id: "__proto__", x: 2 }], "id");
    expect(out.undefined).toEqual({ x: 1 });
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({
      id: "__proto__",
      x: 2,
    });
    expectClean(out);
  });

  it("rejects a non-array through execute", () => {
    expect(execute(byName("data/arrays/keyBy"), { array: {}, key: "id" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("flatten", () => {
  it("flattens fully by default", () => {
    expect(flatten([1, [2, [3, [4, [5]]]]])).toEqual([1, 2, 3, 4, 5]);
  });

  it("depth 0 returns a copy unchanged", () => {
    const input = [1, [2, [3]]];
    const out = flatten(input, 0);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it("handles empty and nested-empty arrays", () => {
    expect(flatten([])).toEqual([]);
    expect(flatten([[], [[]], [[], []]])).toEqual([]);
    expect(flatten([[], [[]]], 1)).toEqual([[]]);
  });

  it("rejects a negative depth through execute", () => {
    expect(execute(byName("data/arrays/flatten"), { array: [], depth: -1 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("chunk", () => {
  it("splits evenly and with a remainder", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    expect(chunk([], 1)).toEqual([]);
  });

  it("fails on a size below 1", () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(execute(byName("data/arrays/chunk"), { array: [1], size: 0 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("zip", () => {
  it("pairs by position and pads the shorter side with null", () => {
    expect(zip([1, 2], ["a"])).toEqual([
      [1, "a"],
      [2, null],
    ]);
    expect(zip([], [true, false])).toEqual([
      [null, true],
      [null, false],
    ]);
    expect(zip([], [])).toEqual([]);
  });

  it("rejects a missing second array through execute", () => {
    expect(execute(byName("data/arrays/zip"), { a: [1] })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("intersection and difference", () => {
  it("intersection compares structurally, dedupes, and keeps a's order", () => {
    expect(intersection([3, 1, 2, 1], [1, 3, 9])).toEqual([3, 1]);
    expect(intersection([{ a: 1, b: 2 }, [1]], [{ b: 2, a: 1 }, [1]])).toEqual([
      { a: 1, b: 2 },
      [1],
    ]);
    expect(intersection([1, "1"], ["1"])).toEqual(["1"]);
    expect(intersection([], [1])).toEqual([]);
  });

  it("difference keeps items of a not in b, duplicates included", () => {
    expect(difference([1, 2, 1, 3], [2])).toEqual([1, 1, 3]);
    expect(difference([{ a: 1 }, { a: 2 }], [{ a: 1 }])).toEqual([{ a: 2 }]);
    expect(difference([1, 2], [1, 2])).toEqual([]);
  });

  it("reject non-array inputs through execute", () => {
    expect(execute(byName("data/arrays/intersection"), { a: 1, b: [] })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(execute(byName("data/arrays/difference"), { a: [], b: null })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("range", () => {
  it("builds ascending, descending, fractional, and empty ranges", () => {
    expect(range(0, 3)).toEqual([0, 1, 2]);
    expect(range(2, 8, 3)).toEqual([2, 5]);
    expect(range(5, 0, -2)).toEqual([5, 3, 1]);
    expect(range(0, 1, 0.5)).toEqual([0, 0.5]);
    expect(range(3, 3)).toEqual([]);
    expect(range(0, 5, -1)).toEqual([]);
  });

  it("allows exactly the maximum length", () => {
    expect(range(0, MAX_RANGE_LENGTH)).toHaveLength(MAX_RANGE_LENGTH);
  });

  it("fails with TOO_LARGE past the cap and INVALID_STEP on 0", () => {
    expect(
      execute(byName("data/arrays/range"), { start: 0, end: MAX_RANGE_LENGTH + 1 })
    ).toMatchObject({
      success: false,
      errorCode: "TOO_LARGE",
    });
    expect(execute(byName("data/arrays/range"), { start: 0, end: 1, step: 0 })).toMatchObject({
      success: false,
      errorCode: "INVALID_STEP",
    });
  });
});

describe("pick and omit", () => {
  it("pick copies only present keys", () => {
    expect(pick({ a: 1, b: undefined, c: 3 }, ["a", "b", "zzz"])).toEqual({ a: 1, b: undefined });
    expect(pick({ a: 1 }, [])).toEqual({});
  });

  it("omit drops listed keys", () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ["b", "zzz"])).toEqual({ a: 1, c: 3 });
    expect(omit({}, ["a"])).toEqual({});
  });

  it("pick with a __proto__ key does not pollute", () => {
    const source = withProto('{"__proto__": {"polluted": true}, "a": 1}');
    const out = pick(source, ["__proto__", "a"]);
    expect(Object.hasOwn(out, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({ polluted: true });
    expect(out.a).toBe(1);
    expectClean(out);
  });

  it("omit with a __proto__ key does not pollute", () => {
    const source = withProto('{"__proto__": {"polluted": true}, "a": 1, "b": 2}');
    const kept = omit(source, ["b"]);
    expect(Object.hasOwn(kept, "__proto__")).toBe(true);
    expectClean(kept);
    const dropped = omit(source, ["__proto__"]);
    expect(Object.hasOwn(dropped, "__proto__")).toBe(false);
    expect(dropped).toEqual({ a: 1, b: 2 });
    expectClean(dropped);
  });

  it("pick does not read inherited properties", () => {
    expect(pick({ a: 1 }, ["constructor", "toString"])).toEqual({});
  });

  it("reject bad key lists through execute", () => {
    expect(execute(byName("data/objects/pick"), { object: {}, keys: "a" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(execute(byName("data/objects/omit"), { object: [], keys: ["a"] })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("get", () => {
  const obj = { a: { b: [{ c: 42 }, "s"], "dot.key": 1 }, n: null, u: undefined };

  it("reads nested paths in string and array form", () => {
    expect(get(obj, "a.b[0].c")).toBe(42);
    expect(get(obj, "a.b.1")).toBe("s");
    expect(get(obj, ["a", "dot.key"])).toBe(1);
    expect(get(obj, "")).toBe(obj);
    expect(get(obj, "n")).toBeNull();
  });

  it("returns the fallback when the path is missing", () => {
    expect(get(obj, "a.x")).toBeUndefined();
    expect(get(obj, "a.x", "dflt")).toBe("dflt");
    expect(get(obj, "a.b[5].c", 0)).toBe(0);
    expect(get(obj, "n.x", "dflt")).toBe("dflt");
    expect(get(obj, "a.b.0.c.d", "dflt")).toBe("dflt");
  });

  it("does not read inherited properties", () => {
    expect(get({ a: {} }, "a.constructor", "none")).toBe("none");
    expect(get({}, "__proto__", "none")).toBe("none");
    expect(get({ a: [] }, "a.length", "none")).toBe("none");
  });

  it("rejects a non-path through execute", () => {
    expect(execute(byName("data/objects/get"), { object: {}, path: 1 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("set", () => {
  it("writes without mutating the input", () => {
    const input = { a: { b: 1 }, list: [1, 2] };
    const out = set(input, "a.b", 2);
    expect(out).toEqual({ a: { b: 2 }, list: [1, 2] });
    expect(input).toEqual({ a: { b: 1 }, list: [1, 2] });
    expect(out.list).not.toBe(input.list);
  });

  it("creates objects and arrays for missing intermediates", () => {
    expect(set({}, "a.b.c", 1)).toEqual({ a: { b: { c: 1 } } });
    expect(set({}, "a[1].b", 1)).toEqual({ a: [null, { b: 1 }] });
    expect(set({ a: null }, "a.b", 1)).toEqual({ a: { b: 1 } });
    expect(set({ a: [1] }, "a.2", 3)).toEqual({ a: [1, null, 3] });
    expect(set({}, ["x.y", "z"], 1)).toEqual({ "x.y": { z: 1 } });
  });

  it("copies the value so later mutation cannot leak in", () => {
    const value = { inner: [1] };
    const out = set({}, "v", value);
    value.inner.push(2);
    expect(out).toEqual({ v: { inner: [1] } });
  });

  it("keeps __proto__ as a data key", () => {
    const out = set({}, "__proto__.polluted", true);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({ polluted: true });
    expectClean(out);
    const nested = set({}, "a.__proto__", { polluted: true });
    expectClean(nested.a as object);
  });

  it("fails with INVALID_PATH on bad paths", () => {
    const fn = byName("data/objects/set");
    expect(execute(fn, { object: {}, path: "", value: 1 })).toMatchObject({
      success: false,
      errorCode: "INVALID_PATH",
    });
    expect(execute(fn, { object: { a: 1 }, path: "a.b", value: 1 })).toMatchObject({
      success: false,
      errorCode: "INVALID_PATH",
    });
    expect(execute(fn, { object: { a: [] }, path: "a.x", value: 1 })).toMatchObject({
      success: false,
      errorCode: "INVALID_PATH",
    });
    expect(execute(fn, { object: {}, path: "a" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("deepMerge", () => {
  it("merges nested objects and replaces arrays and primitives", () => {
    expect(
      deepMerge({ a: { x: 1, deep: { keep: true } }, list: [1, 2], s: "old" }, [
        { a: { y: 2, deep: { add: 1 } }, list: [3] },
        { s: "new", a: { x: 10 } },
      ])
    ).toEqual({ a: { x: 10, y: 2, deep: { keep: true, add: 1 } }, list: [3], s: "new" });
  });

  it("does not mutate inputs and does not alias source values", () => {
    const target = { a: { x: 1 } };
    const source = { a: { y: [1] }, b: { c: 1 } };
    const out = deepMerge(target, [source]);
    expect(target).toEqual({ a: { x: 1 } });
    expect(out.b).not.toBe(source.b);
    (source.a.y as number[]).push(2);
    expect(out).toEqual({ a: { x: 1, y: [1] }, b: { c: 1 } });
  });

  it("treats null, object-over-primitive, and primitive-over-object as replacement", () => {
    expect(deepMerge({ a: { x: 1 } }, [{ a: null }])).toEqual({ a: null });
    expect(deepMerge({ a: 1 }, [{ a: { x: 1 } }])).toEqual({ a: { x: 1 } });
    expect(deepMerge({ a: { x: 1 } }, [{ a: 1 }])).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, [])).toEqual({ a: 1 });
  });

  it("never merges into the prototype", () => {
    const out = deepMerge({}, [withProto('{"__proto__": {"polluted": true}}')]);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({ polluted: true });
    expectClean(out);
    const nested = deepMerge({ a: {} }, [
      { a: withProto('{"constructor": {"prototype": {"polluted": true}}}') },
    ]);
    expectClean(nested);
    expect((nested.a as Record<string, unknown>).constructor).toEqual({
      prototype: { polluted: true },
    });
  });

  it("rejects non-object sources through execute", () => {
    expect(execute(byName("data/objects/deepMerge"), { target: {}, sources: [1] })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("flattenKeys and unflattenKeys", () => {
  const nested = { a: { b: 1, c: [10, { d: 20 }], e: {}, f: [] }, g: null };
  const flat = { "a.b": 1, "a.c.0": 10, "a.c.1.d": 20, "a.e": {}, "a.f": [], g: null };

  it("flattens with dotted keys and index segments", () => {
    expect(flattenKeys(nested)).toEqual(flat);
    expect(flattenKeys({})).toEqual({});
    expect(flattenKeys({ a: { b: 1 } }, "/")).toEqual({ "a/b": 1 });
  });

  it("unflattens back into nested objects and arrays", () => {
    expect(unflattenKeys(flat)).toEqual(nested);
    expect(unflattenKeys({})).toEqual({});
    expect(unflattenKeys({ "a/b": 1 }, "/")).toEqual({ a: { b: 1 } });
    expect(unflattenKeys({ "a.1": "y", "a.0": "x" })).toEqual({ a: ["x", "y"] });
    expect(unflattenKeys({ "a.1": "y" })).toEqual({ a: [null, "y"] });
  });

  it("round-trips arbitrary nesting", () => {
    const value = { x: [{ y: [[1, 2], { z: "s" }] }], w: { v: { u: false } } };
    expect(unflattenKeys(flattenKeys(value))).toEqual(value);
    expect(flattenKeys(unflattenKeys(flattenKeys(value)))).toEqual(flattenKeys(value));
  });

  it("keeps __proto__ segments as data keys", () => {
    const out = unflattenKeys({ "__proto__.polluted": true });
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({ polluted: true });
    expectClean(out);
    const flatOut = flattenKeys(withProto('{"__proto__": {"polluted": true}}'));
    expect(flatOut).toEqual({ "__proto__.polluted": true });
    expectClean(flatOut);
  });

  it("unflattenKeys fails with INVALID_PATH on conflicting keys", () => {
    expect(
      execute(byName("data/objects/unflattenKeys"), { object: { a: 1, "a.b": 2 } })
    ).toMatchObject({
      success: false,
      errorCode: "INVALID_PATH",
    });
    expect(
      execute(byName("data/objects/unflattenKeys"), { object: { "a.0": 1, "a.x": 2 } })
    ).toMatchObject({
      success: false,
      errorCode: "INVALID_PATH",
    });
  });

  it("rejects an empty separator through execute", () => {
    expect(
      execute(byName("data/objects/flattenKeys"), { object: {}, separator: "" })
    ).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("deepEqual", () => {
  it("compares structurally, ignoring key order", () => {
    expect(deepEqual({ a: [1, { b: 2 }], c: null }, { c: null, a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: 1 }, { a: "1" })).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual({}, [])).toBe(false);
    expect(deepEqual({ a: undefined }, { a: null })).toBe(true);
  });

  it("rejects a missing operand through execute", () => {
    expect(execute(byName("data/objects/deepEqual"), { a: 1 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(execute(byName("data/objects/deepEqual"), { a: 1, b: 1 })).toEqual({
      success: true,
      result: true,
    });
  });
});
