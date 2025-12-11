/**
 * Array data structure utility functions
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Get unique values from array
 */
export function unique(array: unknown[]): UtilityResponse<unknown[]> {
  try {
    const result = [...new Set(array)];

    return successResponse(result, {
      inputType: "array",
      outputType: "array",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to get unique values",
      "ARRAY_ERROR"
    );
  }
}

/**
 * Sort array of objects by key
 */
export function sortBy(
  array: Array<Record<string, unknown>>,
  key: string,
  direction: "asc" | "desc" = "asc"
): UtilityResponse<Array<Record<string, unknown>>> {
  try {
    const result = [...array].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];

      if (aVal === bVal) return 0;

      let comparison = 0;
      // Type assertion for comparison - values are primitives from the record
      if ((aVal as number | string) < (bVal as number | string)) comparison = -1;
      if ((aVal as number | string) > (bVal as number | string)) comparison = 1;

      return direction === "asc" ? comparison : -comparison;
    });

    return successResponse(result, {
      inputType: "array",
      outputType: "array",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to sort array",
      "SORT_ERROR"
    );
  }
}
