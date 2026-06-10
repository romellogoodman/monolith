/**
 * Format conversion utility functions
 */

import Papa from "papaparse";
import yaml from "js-yaml";
import { XMLParser } from "fast-xml-parser";
import { marked } from "marked";
import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Convert JSON array to CSV string
 */
export function jsonToCsv(input: Array<Record<string, unknown>>): UtilityResponse<string> {
  try {
    if (input.length === 0) {
      return successResponse("", {
        inputType: "array",
        outputType: "string",
      });
    }

    const csv = Papa.unparse(input);
    return successResponse(csv, {
      inputType: "array",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert JSON to CSV",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Parse CSV string to JSON array
 */
export function csvToJson(input: string): UtilityResponse<Array<Record<string, unknown>>> {
  try {
    const result = Papa.parse(input, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0) {
      return errorResponse(
        `CSV parsing errors: ${result.errors.map((e) => e.message).join(", ")}`,
        "PARSE_ERROR",
        result.errors
      );
    }

    return successResponse(result.data as Array<Record<string, unknown>>, {
      inputType: "string",
      outputType: "array",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to parse CSV",
      "PARSE_ERROR"
    );
  }
}

/**
 * Parse a YAML string into a JSON value.
 */
export function yamlToJson(input: string): UtilityResponse<unknown> {
  try {
    // js-yaml v4's `load()` is safe by default (unlike PyYAML's `yaml.load`).
    // JSON_SCHEMA is the most restrictive schema: only JSON-compatible types,
    // no custom tags, no !!js/function, no arbitrary constructors.
    const result = yaml.load(input, { schema: yaml.JSON_SCHEMA });
    return successResponse(result ?? null, { inputType: "string", outputType: "json" });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to parse YAML",
      "PARSE_ERROR"
    );
  }
}

/**
 * Serialize a JSON value to a YAML string.
 */
export function jsonToYaml(input: unknown): UtilityResponse<string> {
  try {
    const result = yaml.dump(input, { schema: yaml.JSON_SCHEMA, sortKeys: true, lineWidth: -1 });
    return successResponse(result, { inputType: "json", outputType: "string" });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to serialize YAML",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Parse an XML string into a JSON object.
 */
export function xmlToJson(input: string): UtilityResponse<Record<string, unknown>> {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      parseTagValue: true,
      trimValues: true,
    });
    const result = parser.parse(input) as Record<string, unknown>;
    return successResponse(result, { inputType: "string", outputType: "object" });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to parse XML",
      "PARSE_ERROR"
    );
  }
}

/**
 * Render Markdown to HTML.
 *
 * SECURITY: the output is NOT sanitized. Raw HTML embedded in the Markdown —
 * including `<script>` tags and `on*` event handlers — passes through verbatim.
 * Callers must sanitize the result before rendering it in any trusted context.
 */
export function markdownToHtml(input: string): UtilityResponse<string> {
  try {
    // `async: false` guarantees a string return (no Promise) so the CLI and MCP
    // surfaces stay synchronous.
    const result = marked.parse(input, { async: false, gfm: true }) as string;
    return successResponse(result, { inputType: "string", outputType: "string" });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to render markdown",
      "CONVERSION_ERROR"
    );
  }
}
