/**
 * Registry contract: every function is well-formed, discoverable, and its
 * documented examples actually reproduce.
 */

import { describe, expect, it } from "vitest";
import { execute } from "../../src/core/define.js";
import {
  CATEGORIES,
  describeFunction,
  functions,
  getFunction,
  inputJsonSchema,
  listCategories,
  searchFunctions,
  suggestFunctions,
  toToolName,
} from "../../src/core/registry.js";

describe("registry", () => {
  it("has unique canonical names and unique MCP tool names", () => {
    const names = functions.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    const toolNames = names.map(toToolName);
    expect(new Set(toolNames).size).toBe(toolNames.length);
  });

  it("uses category/name identifiers whose category is described", () => {
    for (const fn of functions) {
      expect(fn.name, fn.name).toMatch(/^[a-z]+(\/[a-zA-Z0-9]+){1,2}$/);
      expect(CATEGORIES[fn.name.split("/")[0]], `category description for ${fn.name}`).toBeTruthy();
    }
  });

  it("emits MCP-safe tool names", () => {
    for (const fn of functions) expect(toToolName(fn.name)).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("looks up by canonical or tool name", () => {
    expect(getFunction("strings/toCamelCase")?.name).toBe("strings/toCamelCase");
    expect(getFunction("strings_toCamelCase")?.name).toBe("strings/toCamelCase");
    expect(getFunction("nope/x")).toBeUndefined();
  });

  it("every function documents itself completely", () => {
    for (const fn of functions) {
      expect(fn.description.length, `${fn.name} description`).toBeGreaterThan(20);
      expect(fn.returns.length, `${fn.name} returns`).toBeGreaterThan(0);
      expect(fn.tags.length, `${fn.name} tags`).toBeGreaterThan(1);
      expect(fn.examples.length, `${fn.name} examples`).toBeGreaterThan(0);
      const meta = describeFunction(fn);
      expect(meta.parameters.length, `${fn.name} parameters`).toBeGreaterThan(0);
      for (const p of meta.parameters)
        expect(p.description, `${fn.name} --${p.name} description`).not.toBe("");
    }
  });

  it("every example reproduces exactly", () => {
    for (const fn of functions) {
      for (const example of fn.examples) {
        const outcome = execute(fn, example.input);
        expect(outcome, `${fn.name}: ${example.description}`).toEqual({
          success: true,
          result: example.output,
        });
      }
    }
  });

  it("emits JSON Schema (not Zod internals) for every input", () => {
    for (const fn of functions) {
      const schema = inputJsonSchema(fn) as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema).not.toHaveProperty("$schema");
      expect(schema).not.toHaveProperty("def");
      expect(schema.properties).toBeTypeOf("object");
    }
  });

  it("does not report defaulted fields as required", () => {
    const meta = describeFunction(getFunction("strings/truncate")!);
    const suffix = meta.parameters.find((p) => p.name === "suffix")!;
    expect(suffix.required).toBe(false);
    expect(suffix.default).toBe("...");
    expect(meta.parameters.find((p) => p.name === "input")!.required).toBe(true);
  });

  it("lists categories with counts that sum to the function total", () => {
    const cats = listCategories();
    expect(cats.reduce((n, c) => n + c.count, 0)).toBe(functions.length);
    for (const c of cats) expect(c.description).not.toBe("");
  });

  it("ranks name matches above tag and description matches", () => {
    const results = searchFunctions("slug");
    expect(results[0].name).toBe("strings/slugify");
    expect(searchFunctions("hash", "encoding").every((f) => f.name.startsWith("encoding/"))).toBe(
      true
    );
    expect(searchFunctions("hash", "strings")).toEqual([]);
    expect(searchFunctions("")).toEqual([]);
  });

  it("suggests close names for typos", () => {
    expect(suggestFunctions("strings/slugfy")).toContain("strings/slugify");
    expect(suggestFunctions("slugify")).toContain("strings/slugify");
    expect(suggestFunctions("string/tocamelcase")).toContain("strings/toCamelCase");
    expect(suggestFunctions("zzzzzzzzzzzzzz")).toEqual([]);
  });
});
