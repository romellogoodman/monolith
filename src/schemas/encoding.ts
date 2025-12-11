/**
 * Zod schemas for encoding utility functions
 */

import { z } from "zod";

export const base64EncodeSchema = z.object({
  input: z.string().describe("String to encode to base64"),
});

export const base64DecodeSchema = z.object({
  input: z.string().describe("Base64 string to decode"),
});
