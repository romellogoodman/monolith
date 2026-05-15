/**
 * Math utility functions
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

const NUM_META = { inputType: "number", outputType: "number" } as const;

/**
 * Round number to specified decimal places
 */
export function round(value: number, decimals: number): UtilityResponse<number> {
  try {
    const multiplier = Math.pow(10, decimals);
    return successResponse(Math.round(value * multiplier) / multiplier, NUM_META);
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
    return successResponse(Math.min(Math.max(value, min), max), NUM_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to clamp number",
      "MATH_ERROR"
    );
  }
}

/**
 * Express `value` as a percentage of `total`, rounded to `decimals` places.
 */
export function percentage(
  value: number,
  total: number,
  decimals: number = 2
): UtilityResponse<number> {
  try {
    if (total === 0) {
      return errorResponse("Total cannot be zero", "DIVISION_BY_ZERO");
    }
    const raw = (value / total) * 100;
    const mult = Math.pow(10, decimals);
    return successResponse(Math.round(raw * mult) / mult, NUM_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to compute percentage",
      "MATH_ERROR"
    );
  }
}
