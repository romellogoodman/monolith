/**
 * Standard response format for all utility functions
 */

import type { z } from "zod";

export interface SuccessResponse<T = unknown> {
  success: true;
  result: T;
  metadata?: {
    inputType?: string;
    outputType?: string;
    executionTime?: number;
  };
}

/** One per-field problem from schema validation. */
export interface ValidationIssue {
  /** Dot-joined field path, e.g. "input" or "options.depth". */
  path: string;
  message: string;
  code: string;
}

/**
 * A concrete recovery step. `command` is runnable as-is once any
 * `<placeholder>` tokens are substituted; `when` says why you'd run it.
 */
export interface NextStep {
  command: string;
  when: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  errorCode: string;
  details?: unknown;
  /** Present when errorCode is INVALID_INPUT. */
  issues?: ValidationIssue[];
  /** Ordered recovery steps, most likely fix first. Attached by the surface adapters. */
  next?: NextStep[];
}

export type UtilityResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

/**
 * Helper function to create a success response
 */
export function successResponse<T>(
  result: T,
  metadata?: SuccessResponse<T>["metadata"]
): SuccessResponse<T> {
  return {
    success: true,
    result,
    ...(metadata && { metadata }),
  };
}

/**
 * Helper function to create an error response
 */
export function errorResponse(
  error: string,
  errorCode: string,
  details?: unknown
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error,
    errorCode,
  };
  if (details !== undefined) {
    response.details = details;
  }
  return response;
}

/** Error code used by both surfaces when schema validation fails. */
export const INVALID_INPUT = "INVALID_INPUT";

/**
 * Translate a ZodError into the shared INVALID_INPUT envelope. Both the MCP
 * adapter and the CLI adapter go through this so a bad argument produces the
 * same shape on either surface.
 */
export function validationErrorResponse(error: z.ZodError): ErrorResponse {
  const issues: ValidationIssue[] = error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
    code: issue.code,
  }));
  return { success: false, error: "Invalid input", errorCode: INVALID_INPUT, issues };
}
