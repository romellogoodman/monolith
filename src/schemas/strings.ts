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

export const toSnakeCaseSchema = z.object({
  input: z.string().describe("String to convert to snake_case"),
});

export const toPascalCaseSchema = z.object({
  input: z.string().describe("String to convert to PascalCase"),
});

export const toTitleCaseSchema = z.object({
  input: z.string().describe("String to convert to Title Case"),
});

export const slugifySchema = z.object({
  input: z.string().describe("String to slugify"),
});

export const truncateSchema = z.object({
  input: z.string().describe("String to truncate"),
  length: z.number().int().positive().describe("Maximum length"),
  suffix: z.string().optional().default("...").describe("Suffix to append when truncated"),
});

export const wordCountSchema = z.object({
  input: z.string().describe("String to count words, chars, and lines in"),
});

export const escapeHtmlSchema = z.object({
  input: z.string().describe("String to escape HTML characters in"),
});

export const unescapeHtmlSchema = z.object({
  input: z.string().describe("String to unescape HTML entities in"),
});
