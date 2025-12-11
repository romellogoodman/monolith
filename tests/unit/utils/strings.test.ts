/**
 * Tests for string utility functions
 */

import { describe, it, expect } from "vitest";
import { toCamelCase, toKebabCase } from "../../../src/utils/strings/case.js";
import { truncate } from "../../../src/utils/strings/manipulation.js";

describe("String Case Utilities", () => {
  describe("toCamelCase", () => {
    it("should convert hyphenated string to camelCase", () => {
      const result = toCamelCase("hello-world");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("helloWorld");
      }
    });

    it("should convert spaced string to camelCase", () => {
      const result = toCamelCase("Hello World");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("helloWorld");
      }
    });
  });

  describe("toKebabCase", () => {
    it("should convert camelCase to kebab-case", () => {
      const result = toKebabCase("helloWorld");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("hello-world");
      }
    });

    it("should convert spaced string to kebab-case", () => {
      const result = toKebabCase("Hello World");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("hello-world");
      }
    });
  });

  describe("truncate", () => {
    it("should truncate long string", () => {
      const result = truncate("Hello World", 8);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("Hello...");
      }
    });

    it("should not truncate short string", () => {
      const result = truncate("Hi", 10);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("Hi");
      }
    });
  });
});
