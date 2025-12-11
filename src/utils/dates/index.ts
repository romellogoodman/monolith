/**
 * Date utility functions
 */

import { parse, format, addDays as dateFnsAddDays, parseISO } from "date-fns";
import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Parse date string to ISO format
 */
export function parseDate(input: string, formatStr?: string): UtilityResponse<string> {
  try {
    let date: Date;

    if (formatStr) {
      date = parse(input, formatStr, new Date());
    } else {
      date = new Date(input);
    }

    if (isNaN(date.getTime())) {
      return errorResponse("Invalid date string", "INVALID_DATE");
    }

    return successResponse(date.toISOString(), {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to parse date",
      "PARSE_ERROR"
    );
  }
}

/**
 * Format ISO date with pattern
 */
export function formatDate(isoDate: string, formatStr: string): UtilityResponse<string> {
  try {
    const date = parseISO(isoDate);

    if (isNaN(date.getTime())) {
      return errorResponse("Invalid ISO date string", "INVALID_DATE");
    }

    const result = format(date, formatStr);
    return successResponse(result, {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to format date",
      "FORMAT_ERROR"
    );
  }
}

/**
 * Add days to ISO date
 */
export function addDays(isoDate: string, days: number): UtilityResponse<string> {
  try {
    const date = parseISO(isoDate);

    if (isNaN(date.getTime())) {
      return errorResponse("Invalid ISO date string", "INVALID_DATE");
    }

    const result = dateFnsAddDays(date, days);
    return successResponse(result.toISOString(), {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to add days",
      "CALCULATION_ERROR"
    );
  }
}
