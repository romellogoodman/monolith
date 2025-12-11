/**
 * Function metadata registration
 * This file registers all available utility functions with their metadata
 */

import { registerFunction } from "./index.js";

/**
 * Register all utility functions
 */
export function registerAllFunctions() {
  // String utilities
  registerFunction({
    name: "strings/toCamelCase",
    category: "strings",
    subcategory: "case",
    description: "Convert string to camelCase format",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "String to convert to camelCase",
        required: true,
      },
    ],
    returns: "string in camelCase format",
    examples: [
      {
        description: "Convert hyphenated string",
        input: { input: "hello-world" },
        output: "helloWorld",
      },
      {
        description: "Convert spaced string",
        input: { input: "Hello World" },
        output: "helloWorld",
      },
    ],
    tags: ["string", "case", "camelCase", "transform"],
    performance: "< 1ms",
  });

  registerFunction({
    name: "strings/toKebabCase",
    category: "strings",
    subcategory: "case",
    description: "Convert string to kebab-case format",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "String to convert to kebab-case",
        required: true,
      },
    ],
    returns: "string in kebab-case format",
    examples: [
      {
        description: "Convert camelCase string",
        input: { input: "helloWorld" },
        output: "hello-world",
      },
      {
        description: "Convert spaced string",
        input: { input: "Hello World" },
        output: "hello-world",
      },
    ],
    tags: ["string", "case", "kebabCase", "transform"],
    performance: "< 1ms",
  });

  registerFunction({
    name: "strings/truncate",
    category: "strings",
    subcategory: "manipulation",
    description: "Truncate string to specified length with optional suffix",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "String to truncate",
        required: true,
      },
      {
        name: "length",
        type: "number",
        description: "Maximum length",
        required: true,
      },
      {
        name: "suffix",
        type: "string",
        description: "Suffix to append when truncated",
        required: false,
        default: "...",
      },
    ],
    returns: "truncated string",
    examples: [
      {
        description: "Truncate long string",
        input: { input: "Hello World", length: 8 },
        output: "Hello...",
      },
      {
        description: "String shorter than limit",
        input: { input: "Hi", length: 10 },
        output: "Hi",
      },
    ],
    tags: ["string", "truncate", "shorten", "ellipsis"],
    performance: "< 1ms",
  });

  // Validation utilities
  registerFunction({
    name: "validation/isEmail",
    category: "validation",
    description: "Validate if string is a valid email address",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "String to validate as email",
        required: true,
      },
    ],
    returns: "boolean indicating if input is valid email",
    examples: [
      {
        description: "Valid email",
        input: { input: "user@example.com" },
        output: true,
      },
      {
        description: "Invalid email",
        input: { input: "not-an-email" },
        output: false,
      },
    ],
    tags: ["validation", "email", "check", "verify"],
    performance: "< 1ms",
  });

  registerFunction({
    name: "validation/isUrl",
    category: "validation",
    description: "Validate if string is a valid URL",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "String to validate as URL",
        required: true,
      },
    ],
    returns: "boolean indicating if input is valid URL",
    examples: [
      {
        description: "Valid URL",
        input: { input: "https://example.com" },
        output: true,
      },
      {
        description: "Invalid URL",
        input: { input: "not a url" },
        output: false,
      },
    ],
    tags: ["validation", "url", "link", "check"],
    performance: "< 1ms",
  });

  registerFunction({
    name: "validation/isUuid",
    category: "validation",
    description: "Validate if string is a valid UUID",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "String to validate as UUID",
        required: true,
      },
    ],
    returns: "boolean indicating if input is valid UUID",
    examples: [
      {
        description: "Valid UUID",
        input: { input: "550e8400-e29b-41d4-a716-446655440000" },
        output: true,
      },
      {
        description: "Invalid UUID",
        input: { input: "not-a-uuid" },
        output: false,
      },
    ],
    tags: ["validation", "uuid", "guid", "check"],
    performance: "< 1ms",
  });

  // Conversion utilities
  registerFunction({
    name: "conversion/jsonToCsv",
    category: "conversion",
    description: "Convert JSON array of objects to CSV string",
    parameters: [
      {
        name: "input",
        type: "array",
        description: "Array of objects to convert to CSV",
        required: true,
      },
    ],
    returns: "CSV string representation",
    examples: [
      {
        description: "Convert simple array",
        input: {
          input: [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
          ],
        },
        output: "name,age\\nAlice,30\\nBob,25",
      },
    ],
    tags: ["conversion", "json", "csv", "format"],
    performance: "< 5ms",
  });

  registerFunction({
    name: "conversion/csvToJson",
    category: "conversion",
    description: "Parse CSV string into JSON array of objects",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "CSV string to parse into JSON array",
        required: true,
      },
    ],
    returns: "array of objects",
    examples: [
      {
        description: "Parse simple CSV",
        input: { input: "name,age\\nAlice,30\\nBob,25" },
        output: [
          { name: "Alice", age: "30" },
          { name: "Bob", age: "25" },
        ],
      },
    ],
    tags: ["conversion", "csv", "json", "parse"],
    performance: "< 5ms",
  });

  // Date utilities
  registerFunction({
    name: "dates/parseDate",
    category: "dates",
    subcategory: "parsing",
    description: "Parse date string to ISO 8601 format",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "Date string to parse",
        required: true,
      },
      {
        name: "format",
        type: "string",
        description: "Optional format pattern for parsing",
        required: false,
      },
    ],
    returns: "ISO 8601 date string",
    examples: [
      {
        description: "Parse standard date",
        input: { input: "2025-12-11" },
        output: "2025-12-11T00:00:00.000Z",
      },
    ],
    tags: ["date", "parse", "iso", "format"],
    performance: "< 2ms",
  });

  registerFunction({
    name: "dates/formatDate",
    category: "dates",
    subcategory: "formatting",
    description: "Format ISO date string with custom pattern",
    parameters: [
      {
        name: "isoDate",
        type: "string",
        description: "ISO date string to format",
        required: true,
      },
      {
        name: "format",
        type: "string",
        description: "Format pattern (e.g., 'yyyy-MM-dd', 'MMMM d, yyyy')",
        required: true,
      },
    ],
    returns: "formatted date string",
    examples: [
      {
        description: "Format as US date",
        input: { isoDate: "2025-12-11T00:00:00.000Z", format: "MMMM d, yyyy" },
        output: "December 11, 2025",
      },
    ],
    tags: ["date", "format", "display"],
    performance: "< 2ms",
  });

  registerFunction({
    name: "dates/addDays",
    category: "dates",
    subcategory: "arithmetic",
    description: "Add or subtract days from ISO date",
    parameters: [
      {
        name: "isoDate",
        type: "string",
        description: "ISO date string",
        required: true,
      },
      {
        name: "days",
        type: "number",
        description: "Number of days to add (negative to subtract)",
        required: true,
      },
    ],
    returns: "ISO date string with days added",
    examples: [
      {
        description: "Add 7 days",
        input: { isoDate: "2025-12-11T00:00:00.000Z", days: 7 },
        output: "2025-12-18T00:00:00.000Z",
      },
    ],
    tags: ["date", "add", "subtract", "arithmetic"],
    performance: "< 2ms",
  });

  // Math utilities
  registerFunction({
    name: "math/round",
    category: "math",
    description: "Round number to specified decimal places",
    parameters: [
      {
        name: "value",
        type: "number",
        description: "Number to round",
        required: true,
      },
      {
        name: "decimals",
        type: "number",
        description: "Number of decimal places",
        required: true,
      },
    ],
    returns: "rounded number",
    examples: [
      {
        description: "Round to 2 decimals",
        input: { value: 3.14159, decimals: 2 },
        output: 3.14,
      },
      {
        description: "Round to integer",
        input: { value: 3.7, decimals: 0 },
        output: 4,
      },
    ],
    tags: ["math", "round", "decimal", "precision"],
    performance: "< 1ms",
  });

  registerFunction({
    name: "math/clamp",
    category: "math",
    description: "Clamp number between minimum and maximum values",
    parameters: [
      {
        name: "value",
        type: "number",
        description: "Number to clamp",
        required: true,
      },
      {
        name: "min",
        type: "number",
        description: "Minimum value",
        required: true,
      },
      {
        name: "max",
        type: "number",
        description: "Maximum value",
        required: true,
      },
    ],
    returns: "clamped number",
    examples: [
      {
        description: "Clamp value above max",
        input: { value: 100, min: 0, max: 50 },
        output: 50,
      },
      {
        description: "Clamp value below min",
        input: { value: -10, min: 0, max: 100 },
        output: 0,
      },
    ],
    tags: ["math", "clamp", "limit", "constrain"],
    performance: "< 1ms",
  });

  // Data utilities
  registerFunction({
    name: "data/arrays/unique",
    category: "data",
    subcategory: "arrays",
    description: "Get unique values from array",
    parameters: [
      {
        name: "array",
        type: "array",
        description: "Array to get unique values from",
        required: true,
      },
    ],
    returns: "array of unique values",
    examples: [
      {
        description: "Remove duplicates",
        input: { array: [1, 2, 2, 3, 3, 3] },
        output: [1, 2, 3],
      },
    ],
    tags: ["data", "array", "unique", "dedupe"],
    performance: "< 2ms",
  });

  registerFunction({
    name: "data/arrays/sortBy",
    category: "data",
    subcategory: "arrays",
    description: "Sort array of objects by key",
    parameters: [
      {
        name: "array",
        type: "array",
        description: "Array of objects to sort",
        required: true,
      },
      {
        name: "key",
        type: "string",
        description: "Key to sort by",
        required: true,
      },
      {
        name: "direction",
        type: "string",
        description: "Sort direction: 'asc' or 'desc'",
        required: false,
        default: "asc",
      },
    ],
    returns: "sorted array",
    examples: [
      {
        description: "Sort by age ascending",
        input: {
          array: [
            { name: "Bob", age: 25 },
            { name: "Alice", age: 30 },
          ],
          key: "age",
        },
        output: [
          { name: "Bob", age: 25 },
          { name: "Alice", age: 30 },
        ],
      },
    ],
    tags: ["data", "array", "sort", "order"],
    performance: "< 5ms",
  });

  // Encoding utilities
  registerFunction({
    name: "encoding/base64Encode",
    category: "encoding",
    description: "Encode string to base64",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "String to encode to base64",
        required: true,
      },
    ],
    returns: "base64 encoded string",
    examples: [
      {
        description: "Encode simple string",
        input: { input: "Hello World" },
        output: "SGVsbG8gV29ybGQ=",
      },
    ],
    tags: ["encoding", "base64", "encode"],
    performance: "< 1ms",
  });

  registerFunction({
    name: "encoding/base64Decode",
    category: "encoding",
    description: "Decode base64 string",
    parameters: [
      {
        name: "input",
        type: "string",
        description: "Base64 string to decode",
        required: true,
      },
    ],
    returns: "decoded string",
    examples: [
      {
        description: "Decode base64 string",
        input: { input: "SGVsbG8gV29ybGQ=" },
        output: "Hello World",
      },
    ],
    tags: ["encoding", "base64", "decode"],
    performance: "< 1ms",
  });
}
