import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  diff,
  format,
  functions,
  minify,
  parseJsonc,
  patch,
  pointer,
  query,
  sortKeys,
  validateSchema,
} from "../../../src/functions/json.js";

const fn = (name: string) => {
  const found = functions.find((f) => f.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
};

const failure = (name: string, args: unknown) => {
  const r = execute(fn(name), args);
  expect(r.success).toBe(false);
  return r as { success: false; errorCode: string; error: string; details?: unknown };
};

describe("json/query", () => {
  it("evaluates JMESPath", () => {
    expect(query({ a: { b: [1, 2, 3] } }, "a.b[1:]")).toEqual([2, 3]);
    expect(query([{ n: 3 }, { n: 1 }], "sort_by(@, &n)[0].n")).toBe(1);
  });

  it("returns null for a non-matching path", () => {
    expect(query({ a: 1 }, "b.c")).toBeNull();
    expect(query(null, "a")).toBeNull();
  });

  it("rejects an invalid expression via the envelope", () => {
    const r = failure("json/query", { input: {}, expression: "a[" });
    expect(r.errorCode).toBe("INVALID_EXPRESSION");
    expect(r.details).toEqual({ expression: "a[" });
  });

  it("requires input to be present", () => {
    expect(failure("json/query", { expression: "a" }).errorCode).toBe("INVALID_INPUT");
  });
});

describe("json/pointer", () => {
  const doc = { "": 0, "a/b": { "c~d": 5 }, arr: [10, { x: null }], "m~n": 1 };

  it("returns the whole document for the empty pointer", () => {
    expect(pointer(doc, "")).toBe(doc);
    expect(pointer({}, "")).toEqual({});
  });

  it("walks object keys and array indices", () => {
    expect(pointer(doc, "/arr/0")).toBe(10);
    expect(pointer(doc, "/arr/1/x")).toBeNull();
  });

  it("handles ~0 and ~1 escapes in that order", () => {
    expect(pointer(doc, "/a~1b/c~0d")).toBe(5);
    expect(pointer(doc, "/m~0n")).toBe(1);
    expect(pointer({ "~1": "tilde-one" }, "/~01")).toBe("tilde-one");
  });

  it("addresses an empty-string key", () => {
    expect(pointer(doc, "/")).toBe(0);
  });

  it("rejects non-canonical and out-of-range array indices", () => {
    expect(() => pointer(doc, "/arr/01")).toThrow();
    expect(() => pointer(doc, "/arr/2")).toThrow();
    expect(() => pointer(doc, "/arr/-")).toThrow();
  });

  it("does not resolve inherited properties", () => {
    expect(() => pointer({}, "/toString")).toThrow();
  });

  it("reports the deepest existing path on NOT_FOUND", () => {
    const r = failure("json/pointer", { input: doc, pointer: "/a~1b/nope/deeper" });
    expect(r.errorCode).toBe("NOT_FOUND");
    expect(r.details).toEqual({
      pointer: "/a~1b/nope/deeper",
      deepestExisting: "/a~1b",
      missingToken: "nope",
    });
  });

  it("rejects a pointer that does not start with a slash", () => {
    expect(failure("json/pointer", { input: doc, pointer: "arr/0" }).errorCode).toBe(
      "INVALID_POINTER"
    );
  });
});

describe("json/diff", () => {
  it("emits RFC 6902 operations", () => {
    expect(diff({ a: 1, b: 2 }, { a: 1, c: 3 })).toEqual([
      { op: "remove", path: "/b" },
      { op: "add", path: "/c", value: 3 },
    ]);
  });

  it("returns [] for equal documents", () => {
    expect(diff([], [])).toEqual([]);
    expect(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
  });

  it("round-trips through patch", () => {
    const from = { a: 1, list: [1, 2, 3], nested: { x: "y" } };
    const to = { a: 2, list: [1, 3], nested: { x: "z", w: true } };
    expect(patch(from, diff(from, to))).toEqual(to);
  });

  it("requires both sides", () => {
    expect(failure("json/diff", { from: { a: 1 } }).errorCode).toBe("INVALID_INPUT");
  });
});

describe("json/patch", () => {
  it("applies add, remove, replace, move, copy, and test", () => {
    const input = { a: 1, b: { c: 2 }, list: ["x"] };
    const out = patch(input, [
      { op: "test", path: "/a", value: 1 },
      { op: "replace", path: "/a", value: 9 },
      { op: "move", from: "/b/c", path: "/d" },
      { op: "copy", from: "/d", path: "/list/-" },
      { op: "add", path: "/list/0", value: "first" },
      { op: "remove", path: "/b" },
    ]);
    expect(out).toEqual({ a: 9, d: 2, list: ["first", "x", 2] });
  });

  it("never mutates the input", () => {
    const input = { a: [1, 2], o: { k: "v" } };
    const snapshot = structuredClone(input);
    patch(input, [
      { op: "remove", path: "/a/0" },
      { op: "replace", path: "/o/k", value: "changed" },
    ]);
    expect(input).toEqual(snapshot);
  });

  it("fails on a non-existent path with the operation index", () => {
    const r = failure("json/patch", {
      input: { a: 1 },
      operations: [
        { op: "replace", path: "/a", value: 2 },
        { op: "replace", path: "/missing/deep", value: 1 },
      ],
    });
    expect(r.errorCode).toBe("PATCH_FAILED");
    expect(r.details).toMatchObject({ code: "OPERATION_PATH_UNRESOLVABLE", index: 1 });
  });

  it("fails when a test operation does not hold", () => {
    const r = failure("json/patch", {
      input: { a: 1 },
      operations: [{ op: "test", path: "/a", value: 2 }],
    });
    expect(r.errorCode).toBe("PATCH_FAILED");
    expect(r.details).toMatchObject({ code: "TEST_OPERATION_FAILED", index: 0 });
  });

  it("rejects an unknown op at the schema layer", () => {
    expect(
      failure("json/patch", { input: {}, operations: [{ op: "upsert", path: "/a" }] }).errorCode
    ).toBe("INVALID_INPUT");
  });
});

describe("json/format", () => {
  it("indents with the requested width", () => {
    expect(format({ a: [1] }, 4)).toBe('{\n    "a": [\n        1\n    ]\n}');
    expect(format({ a: [1] }, 0)).toBe('{"a":[1]}');
  });

  it("formats scalars and empty containers", () => {
    expect(format("x")).toBe('"x"');
    expect(format(null)).toBe("null");
    expect(format({})).toBe("{}");
    expect(format([])).toBe("[]");
  });

  it("sorts keys recursively when asked", () => {
    expect(format({ b: { d: 1, c: 2 }, a: 0 }, 0, true)).toBe('{"a":0,"b":{"c":2,"d":1}}');
  });

  it("rejects an out-of-range indent", () => {
    expect(failure("json/format", { input: {}, indent: 9 }).errorCode).toBe("INVALID_INPUT");
  });
});

describe("json/minify", () => {
  it("removes whitespace but keeps string contents", () => {
    expect(minify('{\n  "a b": "x  y",\n  "n": [ 1 , 2 ]\n}')).toBe('{"a b":"x  y","n":[1,2]}');
  });

  it("handles scalar and empty documents", () => {
    expect(minify(" 42 ")).toBe("42");
    expect(minify("{}")).toBe("{}");
  });

  it("fails with PARSE_ERROR on malformed text", () => {
    expect(failure("json/minify", { input: "{a: 1}" }).errorCode).toBe("PARSE_ERROR");
    expect(failure("json/minify", { input: "" }).errorCode).toBe("PARSE_ERROR");
  });
});

describe("json/sortKeys", () => {
  it("sorts nested objects and preserves array order", () => {
    const out = sortKeys({ z: [{ b: 1, a: 2 }, 3], a: { y: 1, x: 2 } });
    expect(JSON.stringify(out)).toBe('{"a":{"x":2,"y":1},"z":[{"a":2,"b":1},3]}');
  });

  it("passes scalars and empty containers through", () => {
    expect(sortKeys(1)).toBe(1);
    expect(sortKeys(null)).toBeNull();
    expect(sortKeys({})).toEqual({});
    expect(sortKeys([])).toEqual([]);
  });

  it("keeps a __proto__ key as a plain own property", () => {
    const input = JSON.parse('{"z": 1, "__proto__": {"polluted": true}, "a": 2}') as object;
    const out = sortKeys(input) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["__proto__", "a", "z"]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.stringify(out)).toBe('{"__proto__":{"polluted":true},"a":2,"z":1}');
  });

  it("does not mutate the input", () => {
    const input = { b: 1, a: 2 };
    sortKeys(input);
    expect(Object.keys(input)).toEqual(["b", "a"]);
  });

  it("requires input through the envelope", () => {
    expect(failure("json/sortKeys", {}).errorCode).toBe("INVALID_INPUT");
  });
});

describe("json/parseJsonc", () => {
  it("accepts line and block comments and trailing commas", () => {
    const text = `{
      // line comment
      "a": 1, /* block */
      "list": [1, 2,],
      "obj": { "k": "v", },
    }`;
    expect(parseJsonc(text)).toEqual({ a: 1, list: [1, 2], obj: { k: "v" } });
  });

  it("parses plain JSON and scalars", () => {
    expect(parseJsonc('{"a": [true, null]}')).toEqual({ a: [true, null] });
    expect(parseJsonc("3")).toBe(3);
  });

  it("fails with PARSE_ERROR and an offset on malformed text", () => {
    const r = failure("json/parseJsonc", { input: '{"a": }' });
    expect(r.errorCode).toBe("PARSE_ERROR");
    expect(r.error).toBe("ValueExpected at offset 6");
    expect(r.details).toMatchObject({ code: "ValueExpected", offset: 6 });
  });
});

describe("json/validateSchema", () => {
  const schema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
      tags: { type: "array", items: { type: "string" }, minItems: 1 },
    },
  };

  it("returns valid: true with no errors", () => {
    expect(validateSchema({ name: "a", tags: ["x"] }, schema)).toEqual({ valid: true, errors: [] });
  });

  it("returns per-path errors instead of throwing", () => {
    const result = validateSchema({ tags: [1] }, schema);
    expect(result.valid).toBe(false);
    const paths = result.errors.map((e) => [e.path, e.keyword]);
    expect(paths).toContainEqual(["", "required"]);
    expect(paths).toContainEqual(["/tags/0", "type"]);
    for (const e of result.errors) expect(typeof e.message).toBe("string");
  });

  it("honors draft-07 via $schema", () => {
    const d7 = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "array",
      items: [{ type: "string" }],
      additionalItems: false,
    };
    expect(validateSchema(["a"], d7).valid).toBe(true);
    expect(validateSchema(["a", "b"], d7).valid).toBe(false);
  });

  it("supports boolean schemas", () => {
    expect(validateSchema(1, true).valid).toBe(true);
    expect(validateSchema(1, false).valid).toBe(false);
  });

  it("fails with INVALID_SCHEMA for an unresolvable $ref", () => {
    const r = failure("json/validateSchema", { input: 1, schema: { $ref: "#/$defs/nope" } });
    expect(r.errorCode).toBe("INVALID_SCHEMA");
  });

  it("rejects a non-object schema at the schema layer", () => {
    expect(failure("json/validateSchema", { input: 1, schema: "string" }).errorCode).toBe(
      "INVALID_INPUT"
    );
  });
});

describe("json examples", () => {
  it.each(functions.flatMap((f) => f.examples.map((e) => [f.name, e.description, f, e] as const)))(
    "%s: %s",
    (_name, _desc, f, example) => {
      expect(execute(f, example.input)).toEqual({ success: true, result: example.output });
    }
  );
});
