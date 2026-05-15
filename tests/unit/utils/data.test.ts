/**
 * Tests for data structure utility functions
 */

import { describe, it, expect } from "vitest";
import { unique, sortBy, groupBy, flatten } from "../../../src/utils/data/arrays.js";
import { pick, omit } from "../../../src/utils/data/objects.js";
import type { UtilityResponse } from "../../../src/types/index.js";

function ok<T>(r: UtilityResponse<T>): T {
  expect(r.success).toBe(true);
  return (r as { success: true; result: T }).result;
}

describe("Data — arrays", () => {
  it("unique removes duplicates, preserving first-seen order", () => {
    expect(ok(unique([3, 1, 2, 1, 3]))).toEqual([3, 1, 2]);
  });

  it("sortBy orders by key in both directions", () => {
    const data = [{ a: 3 }, { a: 1 }, { a: 2 }];
    expect(ok(sortBy(data, "a"))).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(ok(sortBy(data, "a", "desc"))).toEqual([{ a: 3 }, { a: 2 }, { a: 1 }]);
  });

  it("groupBy partitions by string-coerced key value", () => {
    const data = [
      { k: "a", x: 1 },
      { k: "b", x: 2 },
      { k: "a", x: 3 },
    ];
    expect(ok(groupBy(data, "k"))).toEqual({
      a: [
        { k: "a", x: 1 },
        { k: "a", x: 3 },
      ],
      b: [{ k: "b", x: 2 }],
    });
  });

  it("flatten flattens fully by default", () => {
    expect(ok(flatten([1, [2, [3, [4]]]]))).toEqual([1, 2, 3, 4]);
  });

  it("flatten respects explicit depth", () => {
    expect(ok(flatten([1, [2, [3]]], 1))).toEqual([1, 2, [3]]);
  });
});

describe("Data — objects", () => {
  it("pick keeps only listed keys and skips missing ones", () => {
    expect(ok(pick({ a: 1, b: 2, c: 3 }, ["a", "c", "x"]))).toEqual({ a: 1, c: 3 });
  });

  it("omit drops listed keys", () => {
    expect(ok(omit({ a: 1, b: 2, c: 3 }, ["b"]))).toEqual({ a: 1, c: 3 });
  });

  it("pick and omit do not mutate the source", () => {
    const src = { a: 1, b: 2 };
    ok(pick(src, ["a"]));
    ok(omit(src, ["a"]));
    expect(src).toEqual({ a: 1, b: 2 });
  });
});
