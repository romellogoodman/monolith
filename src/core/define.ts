/**
 * `defineFunction` is the one place a utility is declared: name, description,
 * input schema, examples, and implementation live together. Everything else
 * (MCP tool listing, CLI flags, discovery metadata, docs) is derived from it.
 */

import type { z } from "zod";
import {
  ErrorCode,
  UtilityError,
  errorResponse,
  successResponse,
  validationErrorResponse,
  type UtilityResponse,
} from "./responses.js";

export interface Example<I = Record<string, unknown>, R = unknown> {
  description: string;
  input: I;
  output: R;
}

export interface FunctionDef<S extends z.ZodObject = z.ZodObject, R = unknown> {
  /** Canonical `category/name` (or `category/sub/name`) identifier. */
  name: string;
  /** One or two sentences an agent can select the function from. */
  description: string;
  input: S;
  /** Human-readable description of the result value. */
  returns: string;
  tags: string[];
  /** Verified by the test suite: every example must reproduce its output. */
  examples: Array<Example<z.input<S>, R>>;
  /** Return the result, or throw `UtilityError` to reject the input. */
  run: (args: z.output<S>) => R;
}

/** A function definition with its generics erased, as stored in the registry. */
export type AnyFunction = FunctionDef<z.ZodObject, unknown>;

export function defineFunction<S extends z.ZodObject, R>(def: FunctionDef<S, R>): AnyFunction {
  return def as unknown as AnyFunction;
}

/**
 * Validate `rawArgs` against the schema, run the function, and wrap the
 * outcome. This is the only path by which either surface invokes a function.
 */
export function execute(fn: AnyFunction, rawArgs: unknown): UtilityResponse<unknown> {
  const parsed = fn.input.safeParse(rawArgs ?? {});
  if (!parsed.success) return validationErrorResponse(parsed.error);
  try {
    return successResponse(fn.run(parsed.data));
  } catch (error) {
    if (error instanceof UtilityError)
      return errorResponse(error.message, error.code, error.details);
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message, ErrorCode.EXECUTION_ERROR);
  }
}

/** Category name is the first path segment; subcategory the middle one, if any. */
export function splitName(name: string): { category: string; subcategory?: string } {
  const parts = name.split("/");
  return { category: parts[0], subcategory: parts.length > 2 ? parts[1] : undefined };
}
