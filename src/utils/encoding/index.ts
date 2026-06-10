/**
 * Encoding utility functions
 */

import { createHash } from "node:crypto";
import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

const STRING_META = { inputType: "string", outputType: "string" } as const;

/**
 * Encode string to base64
 */
export function base64Encode(input: string): UtilityResponse<string> {
  try {
    return successResponse(Buffer.from(input, "utf-8").toString("base64"), STRING_META);
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
    // `Buffer.from(..., "base64")` silently drops invalid characters, so a
    // garbage input would "succeed" with nonsense output. Validate the shape
    // first (standard and URL-safe alphabets, optional padding).
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(input) || input.replace(/=+$/, "").length % 4 === 1) {
      return errorResponse("Input is not a valid base64 string", "DECODING_ERROR");
    }
    return successResponse(Buffer.from(input, "base64").toString("utf-8"), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to decode base64",
      "DECODING_ERROR"
    );
  }
}

/**
 * Percent-encode a string for use in a URL component.
 */
export function urlEncode(input: string): UtilityResponse<string> {
  try {
    return successResponse(encodeURIComponent(input), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to URL-encode",
      "ENCODING_ERROR"
    );
  }
}

/**
 * Decode a percent-encoded URL component.
 */
export function urlDecode(input: string): UtilityResponse<string> {
  try {
    return successResponse(decodeURIComponent(input), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to URL-decode",
      "DECODING_ERROR"
    );
  }
}

/**
 * Encode a UTF-8 string to lowercase hex.
 */
export function hexEncode(input: string): UtilityResponse<string> {
  try {
    return successResponse(Buffer.from(input, "utf-8").toString("hex"), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to hex-encode",
      "ENCODING_ERROR"
    );
  }
}

/**
 * Decode a hex string to UTF-8.
 */
export function hexDecode(input: string): UtilityResponse<string> {
  try {
    if (!/^[0-9a-fA-F]*$/.test(input) || input.length % 2 !== 0) {
      return errorResponse("Input is not a valid hex string", "DECODING_ERROR");
    }
    return successResponse(Buffer.from(input, "hex").toString("utf-8"), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to hex-decode",
      "DECODING_ERROR"
    );
  }
}

/**
 * SHA-256 hex digest of a UTF-8 string.
 */
export function hashSha256(input: string): UtilityResponse<string> {
  try {
    return successResponse(createHash("sha256").update(input, "utf-8").digest("hex"), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to hash",
      "HASH_ERROR"
    );
  }
}

/**
 * MD5 hex digest of a UTF-8 string. Not for security — useful for legacy
 * checksums and cache keys.
 */
export function hashMd5(input: string): UtilityResponse<string> {
  try {
    return successResponse(createHash("md5").update(input, "utf-8").digest("hex"), STRING_META);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to hash",
      "HASH_ERROR"
    );
  }
}
