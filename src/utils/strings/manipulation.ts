/**
 * String manipulation utilities
 */

import { successResponse, errorResponse, type UtilityResponse } from "../../types/index.js";

/**
 * Truncate string to specified length with suffix
 */
export function truncate(
  input: string,
  length: number,
  suffix: string = "..."
): UtilityResponse<string> {
  try {
    if (input.length <= length) {
      return successResponse(input, {
        inputType: "string",
        outputType: "string",
      });
    }

    // When the suffix is as long as (or longer than) the target length, there
    // is no room for any input characters; `length - suffix.length` would go
    // negative and produce output longer than `length`. Clamp so the result is
    // never longer than `length`.
    const truncated =
      suffix.length >= length
        ? suffix.slice(0, length)
        : input.slice(0, length - suffix.length) + suffix;

    return successResponse(truncated, {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to truncate string",
      "TRUNCATION_ERROR"
    );
  }
}

/**
 * Count words, characters, and lines in a string (a deterministic `wc`).
 */
export function wordCount(
  input: string
): UtilityResponse<{ words: number; chars: number; lines: number }> {
  try {
    const words = input.trim() === "" ? 0 : input.trim().split(/\s+/).length;
    const chars = input.length;
    // POSIX `wc -l` counts newline characters, not visual lines; a non-empty
    // string without a trailing newline still has 1 line of content.
    const lines = input === "" ? 0 : input.split("\n").length;
    return successResponse(
      { words, chars, lines },
      { inputType: "string", outputType: "object" }
    );
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to count string",
      "COUNT_ERROR"
    );
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const HTML_UNESCAPES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&nbsp;": " ",
  "&copy;": "©",
  "&reg;": "®",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

/**
 * Escape HTML-significant characters (&, <, >, ", ').
 */
export function escapeHtml(input: string): UtilityResponse<string> {
  try {
    const result = input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
    return successResponse(result, { inputType: "string", outputType: "string" });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to escape HTML",
      "ESCAPE_ERROR"
    );
  }
}

/**
 * Unescape HTML entities: named (&amp;, &lt;, &nbsp;, ...) plus generic
 * numeric (&#65;) and hex (&#x41;) character references.
 */
export function unescapeHtml(input: string): UtilityResponse<string> {
  try {
    const result = input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
      if (body[0] === "#") {
        const codePoint =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        // Reject out-of-range code points; leave the original text untouched.
        if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
          return match;
        }
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return HTML_UNESCAPES[match] ?? match;
    });
    return successResponse(result, { inputType: "string", outputType: "string" });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to unescape HTML",
      "ESCAPE_ERROR"
    );
  }
}
