/**
 * Response envelope shared by every surface.
 *
 * Success:  { success: true,  result }
 * Failure:  { success: false, error, errorCode, issues?, details?, next? }
 *
 * Implementations never build envelopes themselves: they return a value or
 * throw a `UtilityError`, and `execute()` in ./define.ts wraps the outcome.
 */

import type { z } from "zod";

export interface SuccessResponse<T = unknown> {
  success: true;
  result: T;
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

/** Error codes emitted by the framework itself (functions add their own). */
export const ErrorCode = {
  /** Arguments failed schema validation; `issues` lists each field. */
  INVALID_INPUT: "INVALID_INPUT",
  /** The function threw something other than a UtilityError. */
  EXECUTION_ERROR: "EXECUTION_ERROR",
  /** No function with that name exists. */
  UNKNOWN_FUNCTION: "UNKNOWN_FUNCTION",
} as const;

/**
 * Thrown by function implementations to reject an input on their own terms
 * (e.g. `min > max`). Carries a stable machine-readable code.
 */
export class UtilityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "UtilityError";
  }
}

/** Shorthand for `throw new UtilityError(...)` usable in expression position. */
export function fail(code: string, message: string, details?: unknown): never {
  throw new UtilityError(code, message, details);
}

export function successResponse<T>(result: T): SuccessResponse<T> {
  return { success: true, result };
}

export function errorResponse(error: string, errorCode: string, details?: unknown): ErrorResponse {
  const response: ErrorResponse = { success: false, error, errorCode };
  if (details !== undefined) response.details = details;
  return response;
}

/**
 * Translate a ZodError into the shared INVALID_INPUT envelope. Both adapters
 * go through this so a bad argument produces the same shape on either surface.
 */
export function validationErrorResponse(error: z.ZodError): ErrorResponse {
  const issues: ValidationIssue[] = error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
    code: issue.code,
  }));
  return { success: false, error: "Invalid input", errorCode: ErrorCode.INVALID_INPUT, issues };
}
