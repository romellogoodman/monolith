/**
 * Standard response format for all utility functions
 */

export interface SuccessResponse<T = unknown> {
  success: true;
  result: T;
  metadata?: {
    inputType?: string;
    outputType?: string;
    executionTime?: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  errorCode: string;
  details?: unknown;
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
