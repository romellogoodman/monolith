/**
 * Zod schemas for data structure utility functions
 */

import { z } from "zod";

export const uniqueSchema = z.object({
  array: z.array(z.unknown()).describe("Array to get unique values from"),
});

export const sortBySchema = z.object({
  array: z.array(z.record(z.string(), z.unknown())).describe("Array of objects to sort"),
  key: z.string().describe("Key to sort by"),
  direction: z.enum(["asc", "desc"]).optional().default("asc").describe("Sort direction"),
});

export const groupBySchema = z.object({
  array: z.array(z.record(z.string(), z.unknown())).describe("Array of objects to group"),
  key: z.string().describe("Key to group by"),
});

export const flattenSchema = z.object({
  array: z.array(z.unknown()).describe("Nested array to flatten"),
  depth: z.number().int().nonnegative().optional().describe("Flatten depth; omit to flatten fully"),
});

export const pickSchema = z.object({
  object: z.record(z.string(), z.unknown()).describe("Object to pick keys from"),
  keys: z.array(z.string()).describe("Keys to keep"),
});

export const omitSchema = z.object({
  object: z.record(z.string(), z.unknown()).describe("Object to omit keys from"),
  keys: z.array(z.string()).describe("Keys to drop"),
});
