/**
 * Search functions tool implementation
 */

import { z } from "zod";
import { searchFunctions } from "../registry/index.js";

export const searchFunctionsSchema = z.object({
  query: z.string().describe("Search query (keywords or description)"),
  category: z.string().optional().describe("Optional category filter"),
});

export type SearchFunctionsInput = z.infer<typeof searchFunctionsSchema>;

export function handleSearchFunctions(input: SearchFunctionsInput) {
  const results = searchFunctions(input.query, input.category);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            query: input.query,
            category: input.category,
            count: results.length,
            functions: results.map((fn) => ({
              name: fn.name,
              category: fn.category,
              description: fn.description,
              tags: fn.tags,
            })),
          },
          null,
          2
        ),
      },
    ],
  };
}
