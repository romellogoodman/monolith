/**
 * Tests for validation utility functions
 */

import { describe, it, expect } from "vitest";
import { isEmail, isUrl, isUuid } from "../../../src/utils/validation/index.js";

describe("Validation Utilities", () => {
  describe("isEmail", () => {
    it("should validate correct email", () => {
      const result = isEmail("user@example.com");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe(true);
      }
    });

    it("should reject invalid email", () => {
      const result = isEmail("not-an-email");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe(false);
      }
    });
  });

  describe("isUrl", () => {
    it("should validate correct URL", () => {
      const result = isUrl("https://example.com");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe(true);
      }
    });

    it("should reject invalid URL", () => {
      const result = isUrl("not a url");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe(false);
      }
    });
  });

  describe("isUuid", () => {
    it("should validate correct UUID", () => {
      const result = isUuid("550e8400-e29b-41d4-a716-446655440000");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe(true);
      }
    });

    it("should reject invalid UUID", () => {
      const result = isUuid("not-a-uuid");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe(false);
      }
    });
  });
});
