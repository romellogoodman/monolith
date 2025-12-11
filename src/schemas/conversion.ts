/**
 * Zod schemas for format conversion utility functions
 */

import { z } from "zod";

export const jsonToCsvSchema = z.object({
  input: z.array(z.record(z.unknown())).describe("Array of objects to convert to CSV"),
});

export const csvToJsonSchema = z.object({
  input: z.string().describe("CSV string to parse into JSON array"),
});
