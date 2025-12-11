/**
 * Math utility functions
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Round number to specified decimal places
 */
export function round(value: number, decimals: number): UtilityResponse<number> {
  try {
    const multiplier = Math.pow(10, decimals);
    const result = Math.round(value * multiplier) / multiplier;

    return successResponse(result, {
      inputType: "number",
      outputType: "number",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to round number",
      "MATH_ERROR"
    );
  }
}

/**
 * Clamp number between min and max values
 */
export function clamp(value: number, min: number, max: number): UtilityResponse<number> {
  try {
    if (min > max) {
      return errorResponse("Min value cannot be greater than max value", "INVALID_RANGE");
    }

    const result = Math.min(Math.max(value, min), max);

    return successResponse(result, {
      inputType: "number",
      outputType: "number",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to clamp number",
      "MATH_ERROR"
    );
  }
}
