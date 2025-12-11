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
