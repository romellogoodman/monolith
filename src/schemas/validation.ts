/**
 * Zod schemas for validation utility functions
 */

import { z } from "zod";

export const isEmailSchema = z.object({
  input: z.string().describe("String to validate as email"),
});

export const isUrlSchema = z.object({
  input: z.string().describe("String to validate as URL"),
});

export const isUuidSchema = z.object({
  input: z.string().describe("String to validate as UUID"),
});
