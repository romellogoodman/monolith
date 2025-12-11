/**
 * String manipulation utilities
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Truncate string to specified length with suffix
 */
export function truncate(
  input: string,
  length: number,
  suffix: string = "..."
): UtilityResponse<string> {
  try {
    if (input.length <= length) {
      return successResponse(input, {
        inputType: "string",
        outputType: "string",
      });
    }

    const truncated = input.slice(0, length - suffix.length) + suffix;

    return successResponse(truncated, {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to truncate string",
      "TRUNCATION_ERROR"
    );
  }
}
