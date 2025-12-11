/**
 * String case transformation utilities
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Convert string to camelCase
 */
export function toCamelCase(input: string): UtilityResponse<string> {
  try {
    const result = input
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
      .replace(/^[A-Z]/, (char) => char.toLowerCase());

    return successResponse(result, {
      inputType: "string",
      outputType: "string",
    });
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
    const result = input
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    return successResponse(result, {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert to kebab-case",
      "CONVERSION_ERROR"
    );
  }
}
