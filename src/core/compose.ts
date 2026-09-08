/**
 * Composition: run several functions in one call. Because every function is
 * pure, chaining them server-side is safe and saves the caller a round trip
 * per step.
 */

import { z } from "zod";
import { execute } from "./define.js";
import {
  ErrorCode,
  errorResponse,
  type SuccessResponse,
  type UtilityResponse,
} from "./responses.js";
import { getFunction, requiredFields } from "./registry.js";

export const callSchema = z.object({
  name: z.string().describe("Function name, e.g. strings/slugify"),
  args: z.record(z.string(), z.unknown()).default({}).describe("Arguments for that function"),
});
export type Call = z.infer<typeof callSchema>;

export const batchSchema = z.object({
  calls: z.array(callSchema).min(1).max(100).describe("Independent calls to run in order"),
});

export const pipeSchema = z.object({
  input: z.unknown().describe("Value fed to the first step"),
  steps: z
    .array(
      z.object({
        name: z.string().describe("Function name, e.g. strings/slugify"),
        args: z
          .record(z.string(), z.unknown())
          .default({})
          .describe("Extra arguments for this step"),
        into: z
          .string()
          .optional()
          .describe(
            "Which argument receives the previous result (default: the first required one)"
          ),
      })
    )
    .min(1)
    .max(100)
    .describe("Functions applied in sequence; each receives the previous result"),
});
export type PipeStep = z.infer<typeof pipeSchema>["steps"][number];

export function runCall(call: Call): UtilityResponse<unknown> {
  const fn = getFunction(call.name);
  if (!fn) return errorResponse(`Unknown function: ${call.name}`, ErrorCode.UNKNOWN_FUNCTION);
  return execute(fn, call.args);
}

/** Run independent calls; every call gets its own envelope, failures do not stop the batch. */
export function runBatch(calls: Call[]): Array<UtilityResponse<unknown> & { name: string }> {
  return calls.map((call) => ({ name: call.name, ...runCall(call) }));
}

export interface PipeFailure {
  success: false;
  step: number;
  name: string;
  error: string;
  errorCode: string;
  issues?: unknown;
}

/** Thread a value through steps; stops at the first failing step and reports which one. */
export function runPipe(input: unknown, steps: PipeStep[]): SuccessResponse<unknown> | PipeFailure {
  let value = input;
  for (const [index, step] of steps.entries()) {
    const fn = getFunction(step.name);
    if (!fn) {
      return {
        success: false,
        step: index,
        name: step.name,
        error: `Unknown function: ${step.name}`,
        errorCode: ErrorCode.UNKNOWN_FUNCTION,
      };
    }
    const into = step.into ?? requiredFields(fn)[0] ?? Object.keys(fn.input.shape)[0];
    const result = execute(fn, { ...step.args, [into]: value });
    if (!result.success) {
      return {
        success: false,
        step: index,
        name: step.name,
        error: result.error,
        errorCode: result.errorCode,
        ...(result.issues && { issues: result.issues }),
      };
    }
    value = result.result;
  }
  return { success: true, result: value };
}
