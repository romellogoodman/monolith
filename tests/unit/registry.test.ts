/**
 * Tests for function registry
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  getAllFunctions,
  getCategories,
  searchFunctions,
  getFunction,
} from "../../src/registry/index.js";
import { registerAllFunctions } from "../../src/registry/functions.js";
import { dispatchEntries } from "../../src/registry/dispatch.js";

describe("Function Registry", () => {
  beforeAll(() => {
    registerAllFunctions();
  });

  describe("getAllFunctions", () => {
    it("should return all registered functions", () => {
      const functions = getAllFunctions();
      expect(functions.length).toBeGreaterThan(0);
      expect(functions[0]).toHaveProperty("name");
      expect(functions[0]).toHaveProperty("category");
      expect(functions[0]).toHaveProperty("description");
    });
  });

  describe("getCategories", () => {
    it("should return all categories", () => {
      const categories = getCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(categories[0]).toHaveProperty("name");
      expect(categories[0]).toHaveProperty("count");
    });
  });

  describe("searchFunctions", () => {
    it("should find functions by keyword", () => {
      const results = searchFunctions("camel");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("Camel");
    });

    it("should filter by category", () => {
      const results = searchFunctions("", "strings");
      expect(results.length).toBeGreaterThan(0);
      results.forEach((fn) => {
        expect(fn.category).toBe("strings");
      });
    });
  });

  describe("getFunction", () => {
    it("should retrieve specific function", () => {
      const fn = getFunction("strings/toCamelCase");
      expect(fn).toBeDefined();
      expect(fn?.name).toBe("strings/toCamelCase");
    });

    it("should return undefined for non-existent function", () => {
      const fn = getFunction("nonexistent/function");
      expect(fn).toBeUndefined();
    });
  });

  describe("dispatch ↔ registry consistency", () => {
    it("every dispatch entry has discoverable metadata", () => {
      for (const entry of dispatchEntries) {
        const meta = getFunction(entry.name);
        expect(meta, `missing registry metadata for ${entry.name}`).toBeDefined();
        expect(meta!.description).toBe(entry.description);
      }
    });

    it("every dispatch entry has complete discovery extras (examples, tags, returns)", () => {
      // Guards against adding a function to dispatch.ts and forgetting EXTRAS in
      // functions.ts. Without this, `describe`/`search` quietly degrade.
      for (const entry of dispatchEntries) {
        const meta = getFunction(entry.name)!;
        expect(meta.examples.length, `${entry.name} has no examples`).toBeGreaterThan(0);
        expect(meta.tags.length, `${entry.name} has no tags`).toBeGreaterThan(1);
        expect(meta.returns, `${entry.name} has no returns description`).not.toBe("");
      }
    });

    it("derived parameters reflect the Zod schema", () => {
      const truncate = getFunction("strings/truncate")!;
      const paramNames = truncate.parameters.map((p) => p.name);
      expect(paramNames).toEqual(["input", "length", "suffix"]);
      expect(truncate.parameters.find((p) => p.name === "suffix")?.required).toBe(false);
      expect(truncate.parameters.find((p) => p.name === "suffix")?.default).toBe("...");
      expect(truncate.parameters.find((p) => p.name === "input")?.required).toBe(true);
    });
  });
});
