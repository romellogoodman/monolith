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

export const urlEncodeSchema = z.object({
  input: z.string().describe("String to percent-encode"),
});

export const urlDecodeSchema = z.object({
  input: z.string().describe("Percent-encoded string to decode"),
});

export const hexEncodeSchema = z.object({
  input: z.string().describe("String to hex-encode"),
});

export const hexDecodeSchema = z.object({
  input: z.string().describe("Hex string to decode"),
});

export const hashSha256Schema = z.object({
  input: z.string().describe("String to hash with SHA-256"),
});

export const hashMd5Schema = z.object({
  input: z.string().describe("String to hash with MD5"),
});
