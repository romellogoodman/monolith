/**
 * List categories tool implementation
 */

import { z } from "zod";
import { getCategories } from "../registry/index.js";

export const listCategoriesSchema = z.object({});

export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>;

export function handleListCategories(_input: ListCategoriesInput) {
  const categories = getCategories();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: categories.length,
            categories: categories.sort((a, b) => a.name.localeCompare(b.name)),
          },
          null,
          2
        ),
      },
    ],
  };
}
