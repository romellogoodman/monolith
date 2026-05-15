/**
 * Object data structure utility functions
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

const OBJECT_META = { inputType: "object", outputType: "object" } as const;

/**
 * Return a new object containing only the listed keys.
 * Keys not present on the source are skipped (not set to undefined).
 */
export function pick(
  object: Record<string, unknown>,
  keys: string[]
): UtilityResponse<Record<string, unknown>> {
  try {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        result[key] = object[key];
      }
    }
    return successResponse(result, OBJECT_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to pick keys",
      "OBJECT_ERROR"
    );
  }
}

/**
 * Return a new object with the listed keys removed.
 */
export function omit(
  object: Record<string, unknown>,
  keys: string[]
): UtilityResponse<Record<string, unknown>> {
  try {
    const drop = new Set(keys);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(object)) {
      if (!drop.has(key)) {
        result[key] = value;
      }
    }
    return successResponse(result, OBJECT_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to omit keys",
      "OBJECT_ERROR"
    );
  }
}
