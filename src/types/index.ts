/**
 * Core type definitions for the utility server
 */

export * from "./responses.js";

/**
 * Function parameter information
 */
export interface ParameterInfo {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

/**
 * Usage example for a function
 */
export interface Example {
  description: string;
  input: Record<string, unknown>;
  output: unknown;
}

/**
 * Metadata for a utility function
 */
export interface FunctionMetadata {
  name: string;
  category: string;
  subcategory?: string;
  description: string;
  parameters: ParameterInfo[];
  returns: string;
  examples: Example[];
  tags: string[];
  performance?: string;
}

/**
 * Category information
 */
export interface CategoryInfo {
  name: string;
  description: string;
  count: number;
}
