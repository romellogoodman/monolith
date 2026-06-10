/**
 * Date utility functions
 */

import {
  parse,
  format,
  addDays as dateFnsAddDays,
  parseISO,
  differenceInCalendarDays,
} from "date-fns";
import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Parse date string to ISO format
 */
// Accept only unambiguous ISO 8601 inputs in the no-format path. Locale forms
// like "3/4/2025" parse differently depending on host conventions, which would
// make this "deterministic" function host-dependent.
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function parseDate(input: string, formatStr?: string): UtilityResponse<string> {
  try {
    let date: Date;

    if (formatStr) {
      // Use a fixed UTC reference so fields absent from the format don't pick up
      // the current date/time, then reinterpret the parsed wall-clock as UTC so
      // the result is independent of the host timezone.
      const local = parse(input, formatStr, new Date(0));
      if (isNaN(local.getTime())) {
        return errorResponse("Invalid date string", "INVALID_DATE");
      }
      date = new Date(
        Date.UTC(
          local.getFullYear(),
          local.getMonth(),
          local.getDate(),
          local.getHours(),
          local.getMinutes(),
          local.getSeconds(),
          local.getMilliseconds()
        )
      );
    } else {
      if (!ISO_8601.test(input.trim())) {
        return errorResponse(
          "Input is not ISO 8601. Pass an explicit `format` for non-ISO date strings.",
          "INVALID_DATE"
        );
      }
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

/**
 * Whole calendar days between two ISO dates (`to - from`). Negative when
 * `to` is earlier than `from`.
 */
export function diffDays(from: string, to: string): UtilityResponse<number> {
  try {
    const a = parseISO(from);
    const b = parseISO(to);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) {
      return errorResponse("Invalid ISO date string", "INVALID_DATE");
    }
    return successResponse(differenceInCalendarDays(b, a), {
      inputType: "string",
      outputType: "number",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to diff dates",
      "CALCULATION_ERROR"
    );
  }
}
