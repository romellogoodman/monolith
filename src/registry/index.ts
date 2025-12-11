/**
 * Central function registry for discovery and lookup
 */

import type { FunctionMetadata, CategoryInfo } from "../types/index.js";

/**
 * Internal storage for all registered functions
 */
const functionRegistry: FunctionMetadata[] = [];

/**
 * Register a function in the registry
 */
export function registerFunction(metadata: FunctionMetadata): void {
  functionRegistry.push(metadata);
}

/**
 * Get all registered functions
 */
export function getAllFunctions(): FunctionMetadata[] {
  return [...functionRegistry];
}

/**
 * Get functions by category
 */
export function getFunctionsByCategory(category: string): FunctionMetadata[] {
  return functionRegistry.filter((fn) => fn.category === category);
}

/**
 * Search functions by query string
 * Searches in: name, description, tags, and category
 */
export function searchFunctions(query: string, category?: string): FunctionMetadata[] {
  const lowerQuery = query.toLowerCase();

  return functionRegistry.filter((fn) => {
    // Filter by category if specified
    if (category && fn.category !== category) {
      return false;
    }

    // Search in name, description, and tags
    return (
      fn.name.toLowerCase().includes(lowerQuery) ||
      fn.description.toLowerCase().includes(lowerQuery) ||
      fn.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
      fn.category.toLowerCase().includes(lowerQuery)
    );
  });
}

/**
 * Get a specific function by name
 */
export function getFunction(name: string): FunctionMetadata | undefined {
  return functionRegistry.find((fn) => fn.name === name);
}

/**
 * Get all unique categories with their counts
 */
export function getCategories(): CategoryInfo[] {
  const categoryMap = new Map<string, { description: string; count: number }>();

  for (const fn of functionRegistry) {
    const existing = categoryMap.get(fn.category);
    if (existing) {
      existing.count++;
    } else {
      categoryMap.set(fn.category, {
        description: `${fn.category.charAt(0).toUpperCase() + fn.category.slice(1)} utility functions`,
        count: 1,
      });
    }
  }

  return Array.from(categoryMap.entries()).map(([name, { description, count }]) => ({
    name,
    description,
    count,
  }));
}

/**
 * Get the total number of registered functions
 */
export function getFunctionCount(): number {
  return functionRegistry.length;
}
