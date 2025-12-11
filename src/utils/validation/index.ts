/**
 * Validation utility functions
 */

import validator from "validator";
import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Validate email address format
 */
export function isEmail(input: string): UtilityResponse<boolean> {
  try {
    const result = validator.isEmail(input);
    return successResponse(result, {
      inputType: "string",
      outputType: "boolean",
    });
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
    const result = validator.isURL(input);
    return successResponse(result, {
      inputType: "string",
      outputType: "boolean",
    });
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
    const result = validator.isUUID(input);
    return successResponse(result, {
      inputType: "string",
      outputType: "boolean",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to validate UUID",
      "VALIDATION_ERROR"
    );
  }
}
