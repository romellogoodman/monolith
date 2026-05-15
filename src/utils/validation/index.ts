/**
 * Validation utility functions
 */

import validator from "validator";
import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

const BOOL_META = { inputType: "string", outputType: "boolean" } as const;

/**
 * Validate email address format
 */
export function isEmail(input: string): UtilityResponse<boolean> {
  try {
    return successResponse(validator.isEmail(input), BOOL_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to validate email",
      "VALIDATION_ERROR"
    );
  }
}

/**
 * Validate URL format
 */
export function isUrl(input: string): UtilityResponse<boolean> {
  try {
    return successResponse(validator.isURL(input), BOOL_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to validate URL",
      "VALIDATION_ERROR"
    );
  }
}

/**
 * Validate UUID format
 */
export function isUuid(input: string): UtilityResponse<boolean> {
  try {
    return successResponse(validator.isUUID(input), BOOL_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to validate UUID",
      "VALIDATION_ERROR"
    );
  }
}

/**
 * Check whether a string is syntactically valid JSON.
 */
export function isJson(input: string): UtilityResponse<boolean> {
  try {
    try {
      JSON.parse(input);
      return successResponse(true, BOOL_META);
    } catch {
      return successResponse(false, BOOL_META);
    }
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to validate JSON",
      "VALIDATION_ERROR"
    );
  }
}

/**
 * Check whether a string is a valid ISO 8601 date.
 */
export function isIsoDate(input: string): UtilityResponse<boolean> {
  try {
    return successResponse(validator.isISO8601(input, { strict: true }), BOOL_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to validate ISO date",
      "VALIDATION_ERROR"
    );
  }
}
