/**
 * Zod schemas for math utility functions
 */

import { z } from "zod";

export const roundSchema = z.object({
  value: z.number().describe("Number to round"),
  decimals: z.number().int().nonnegative().describe("Number of decimal places"),
});

export const clampSchema = z.object({
  value: z.number().describe("Number to clamp"),
  min: z.number().describe("Minimum value"),
  max: z.number().describe("Maximum value"),
});

export const percentageSchema = z.object({
  value: z.number().describe("Part value"),
  total: z.number().describe("Whole value (cannot be zero)"),
  decimals: z.number().int().nonnegative().optional().default(2).describe("Decimal places to round to"),
});
