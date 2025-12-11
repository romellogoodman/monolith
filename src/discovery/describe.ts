/**
 * Describe function tool implementation
 */

import { z } from "zod";
import { getFunction } from "../registry/index.js";

export const describeFunctionSchema = z.object({
  name: z.string().describe("Full function name (e.g., 'strings/toCamelCase')"),
});

export type DescribeFunctionInput = z.infer<typeof describeFunctionSchema>;

export function handleDescribeFunction(input: DescribeFunctionInput) {
  const fn = getFunction(input.name);

  if (!fn) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: `Function '${input.name}' not found`,
              errorCode: "FUNCTION_NOT_FOUND",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(fn, null, 2),
      },
    ],
  };
}
