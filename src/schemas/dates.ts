/**
 * Zod schemas for date utility functions
 */

import { z } from "zod";

export const parseDateSchema = z.object({
  input: z.string().describe("Date string to parse"),
  format: z.string().optional().describe("Optional format pattern for parsing"),
});

export const formatDateSchema = z.object({
  isoDate: z.string().describe("ISO date string to format"),
  format: z.string().describe("Format pattern (e.g., 'yyyy-MM-dd', 'MMMM d, yyyy')"),
});

export const addDaysSchema = z.object({
  isoDate: z.string().describe("ISO date string"),
  days: z.number().int().describe("Number of days to add (negative to subtract)"),
});
