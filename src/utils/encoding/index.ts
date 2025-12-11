/**
 * Encoding utility functions
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Encode string to base64
 */
export function base64Encode(input: string): UtilityResponse<string> {
  try {
    const result = Buffer.from(input, "utf-8").toString("base64");

    return successResponse(result, {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to encode base64",
      "ENCODING_ERROR"
    );
  }
}

/**
 * Decode base64 string
 */
export function base64Decode(input: string): UtilityResponse<string> {
  try {
    const result = Buffer.from(input, "base64").toString("utf-8");

    return successResponse(result, {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to decode base64",
      "DECODING_ERROR"
    );
  }
}
