/**
 * Format conversion utility functions
 */

import Papa from "papaparse";
import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Convert JSON array to CSV string
 */
export function jsonToCsv(input: Array<Record<string, unknown>>): UtilityResponse<string> {
  try {
    if (input.length === 0) {
      return successResponse("", {
        inputType: "array",
        outputType: "string",
      });
    }

    const csv = Papa.unparse(input);
    return successResponse(csv, {
      inputType: "array",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert JSON to CSV",
      "CONVERSION_ERROR"
    );
  }
}

/**
 * Parse CSV string to JSON array
 */
export function csvToJson(input: string): UtilityResponse<Array<Record<string, unknown>>> {
  try {
    const result = Papa.parse(input, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0) {
      return errorResponse(
        `CSV parsing errors: ${result.errors.map((e) => e.message).join(", ")}`,
        "PARSE_ERROR",
        result.errors
      );
    }

    return successResponse(result.data as Array<Record<string, unknown>>, {
      inputType: "string",
      outputType: "array",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to parse CSV",
      "PARSE_ERROR"
    );
  }
}
