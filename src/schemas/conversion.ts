/**
 * Zod schemas for format conversion utility functions
 */

import { z } from "zod";

export const jsonToCsvSchema = z.object({
  input: z.array(z.record(z.string(), z.unknown())).describe("Array of objects to convert to CSV"),
});

export const csvToJsonSchema = z.object({
  input: z.string().describe("CSV string to parse into JSON array"),
});

export const yamlToJsonSchema = z.object({
  input: z.string().describe("YAML string to parse"),
});

export const jsonToYamlSchema = z.object({
  input: z.unknown().describe("JSON value to serialize as YAML"),
});

export const xmlToJsonSchema = z.object({
  input: z.string().describe("XML string to parse"),
});

export const markdownToHtmlSchema = z.object({
  input: z.string().describe("Markdown string to render as HTML"),
});
