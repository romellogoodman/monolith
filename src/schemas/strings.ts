/**
 * Zod schemas for string utility functions
 */

import { z } from "zod";

export const toCamelCaseSchema = z.object({
  input: z.string().describe("String to convert to camelCase"),
});

export const toKebabCaseSchema = z.object({
  input: z.string().describe("String to convert to kebab-case"),
});

export const truncateSchema = z.object({
  input: z.string().describe("String to truncate"),
  length: z.number().int().positive().describe("Maximum length"),
  suffix: z.string().optional().default("...").describe("Suffix to append when truncated"),
});
