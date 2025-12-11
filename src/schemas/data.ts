/**
 * Zod schemas for data structure utility functions
 */

import { z } from "zod";

export const uniqueSchema = z.object({
  array: z.array(z.unknown()).describe("Array to get unique values from"),
});

export const sortBySchema = z.object({
  array: z.array(z.record(z.unknown())).describe("Array of objects to sort"),
  key: z.string().describe("Key to sort by"),
  direction: z.enum(["asc", "desc"]).optional().default("asc").describe("Sort direction"),
});
