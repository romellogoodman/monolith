/**
 * String case transformation utilities
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

const STRING_META = { inputType: "string", outputType: "string" } as const;

/** Split an arbitrarily-cased string into lowercase words. */
function words(input: string): string[] {
  return input
    // Split camelCase and PascalCase boundaries
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // Treat any non-alphanumeric run as a separator
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(input: string): UtilityResponse<string> {
  try {
    const result = words(input)
      .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join("");
    return successResponse(result, STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert to camelCase",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(input: string): UtilityResponse<string> {
  try {
    return successResponse(words(input).join("-"), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert to kebab-case",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(input: string): UtilityResponse<string> {
  try {
    return successResponse(words(input).join("_"), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert to snake_case",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(input: string): UtilityResponse<string> {
  try {
    const result = words(input)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
    return successResponse(result, STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert to PascalCase",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Convert string to Title Case
 */
export function toTitleCase(input: string): UtilityResponse<string> {
  try {
    const result = words(input)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return successResponse(result, STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert to Title Case",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Slugify a string: lowercase, hyphen-separated, ASCII-safe.
 * Diacritics are stripped (café → cafe) before non-alphanumerics are dropped.
 */
export function slugify(input: string): UtilityResponse<string> {
  try {
    const result = input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return successResponse(result, STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to slugify string",
      "CONVERSION_ERROR"
    );
  }
}
