/**
 * MCP Server configuration and setup
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Registry
import { registerAllFunctions } from "./registry/functions.js";

// Discovery tools
import {
  searchFunctionsSchema,
  handleSearchFunctions,
} from "./discovery/search.js";
import {
  listCategoriesSchema,
  handleListCategories,
} from "./discovery/categories.js";
import {
  describeFunctionSchema,
  handleDescribeFunction,
} from "./discovery/describe.js";

// Schemas
import * as stringSchemas from "./schemas/strings.js";
import * as validationSchemas from "./schemas/validation.js";
import * as conversionSchemas from "./schemas/conversion.js";
import * as dateSchemas from "./schemas/dates.js";
import * as mathSchemas from "./schemas/math.js";
import * as dataSchemas from "./schemas/data.js";
import * as encodingSchemas from "./schemas/encoding.js";

// Utility functions
import * as stringCase from "./utils/strings/case.js";
import * as stringManipulation from "./utils/strings/manipulation.js";
import * as validation from "./utils/validation/index.js";
import * as conversion from "./utils/conversion/index.js";
import * as dates from "./utils/dates/index.js";
import * as math from "./utils/math/index.js";
import * as arrays from "./utils/data/arrays.js";
import * as encoding from "./utils/encoding/index.js";

/**
 * Create and configure the MCP server
 */
export function createServer() {
  const server = new Server(
    {
      name: "monolith",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all function metadata
  registerAllFunctions();

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Discovery tools
        {
          name: "search_functions",
          description:
            "Search for utility functions by keywords. Returns matching functions with their descriptions.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query (keywords or description)",
              },
              category: {
                type: "string",
                description: "Optional category filter",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "list_categories",
          description: "List all available function categories with their counts.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "describe_function",
          description:
            "Get detailed information about a specific function including parameters, examples, and usage.",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Full function name (e.g., 'strings/toCamelCase')",
              },
            },
            required: ["name"],
          },
        },
        // String utilities
        {
          name: "strings/toCamelCase",
          description: "Convert string to camelCase format",
          inputSchema: stringSchemas.toCamelCaseSchema.shape,
        },
        {
          name: "strings/toKebabCase",
          description: "Convert string to kebab-case format",
          inputSchema: stringSchemas.toKebabCaseSchema.shape,
        },
        {
          name: "strings/truncate",
          description: "Truncate string to specified length with optional suffix",
          inputSchema: stringSchemas.truncateSchema.shape,
        },
        // Validation utilities
        {
          name: "validation/isEmail",
          description: "Validate if string is a valid email address",
          inputSchema: validationSchemas.isEmailSchema.shape,
        },
        {
          name: "validation/isUrl",
          description: "Validate if string is a valid URL",
          inputSchema: validationSchemas.isUrlSchema.shape,
        },
        {
          name: "validation/isUuid",
          description: "Validate if string is a valid UUID",
          inputSchema: validationSchemas.isUuidSchema.shape,
        },
        // Conversion utilities
        {
          name: "conversion/jsonToCsv",
          description: "Convert JSON array of objects to CSV string",
          inputSchema: conversionSchemas.jsonToCsvSchema.shape,
        },
        {
          name: "conversion/csvToJson",
          description: "Parse CSV string into JSON array of objects",
          inputSchema: conversionSchemas.csvToJsonSchema.shape,
        },
        // Date utilities
        {
          name: "dates/parseDate",
          description: "Parse date string to ISO 8601 format",
          inputSchema: dateSchemas.parseDateSchema.shape,
        },
        {
          name: "dates/formatDate",
          description: "Format ISO date string with custom pattern",
          inputSchema: dateSchemas.formatDateSchema.shape,
        },
        {
          name: "dates/addDays",
          description: "Add or subtract days from ISO date",
          inputSchema: dateSchemas.addDaysSchema.shape,
        },
        // Math utilities
        {
          name: "math/round",
          description: "Round number to specified decimal places",
          inputSchema: mathSchemas.roundSchema.shape,
        },
        {
          name: "math/clamp",
          description: "Clamp number between minimum and maximum values",
          inputSchema: mathSchemas.clampSchema.shape,
        },
        // Data utilities
        {
          name: "data/arrays/unique",
          description: "Get unique values from array",
          inputSchema: dataSchemas.uniqueSchema.shape,
        },
        {
          name: "data/arrays/sortBy",
          description: "Sort array of objects by key",
          inputSchema: dataSchemas.sortBySchema.shape,
        },
        // Encoding utilities
        {
          name: "encoding/base64Encode",
          description: "Encode string to base64",
          inputSchema: encodingSchemas.base64EncodeSchema.shape,
        },
        {
          name: "encoding/base64Decode",
          description: "Decode base64 string",
          inputSchema: encodingSchemas.base64DecodeSchema.shape,
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Discovery tools
      if (name === "search_functions") {
        const validated = searchFunctionsSchema.parse(args);
        return handleSearchFunctions(validated);
      }

      if (name === "list_categories") {
        const validated = listCategoriesSchema.parse(args);
        return handleListCategories(validated);
      }

      if (name === "describe_function") {
        const validated = describeFunctionSchema.parse(args);
        return handleDescribeFunction(validated);
      }

      // String utilities
      if (name === "strings/toCamelCase") {
        const validated = stringSchemas.toCamelCaseSchema.parse(args);
        const result = stringCase.toCamelCase(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "strings/toKebabCase") {
        const validated = stringSchemas.toKebabCaseSchema.parse(args);
        const result = stringCase.toKebabCase(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "strings/truncate") {
        const validated = stringSchemas.truncateSchema.parse(args);
        const result = stringManipulation.truncate(
          validated.input,
          validated.length,
          validated.suffix
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Validation utilities
      if (name === "validation/isEmail") {
        const validated = validationSchemas.isEmailSchema.parse(args);
        const result = validation.isEmail(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "validation/isUrl") {
        const validated = validationSchemas.isUrlSchema.parse(args);
        const result = validation.isUrl(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "validation/isUuid") {
        const validated = validationSchemas.isUuidSchema.parse(args);
        const result = validation.isUuid(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Conversion utilities
      if (name === "conversion/jsonToCsv") {
        const validated = conversionSchemas.jsonToCsvSchema.parse(args);
        const result = conversion.jsonToCsv(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "conversion/csvToJson") {
        const validated = conversionSchemas.csvToJsonSchema.parse(args);
        const result = conversion.csvToJson(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Date utilities
      if (name === "dates/parseDate") {
        const validated = dateSchemas.parseDateSchema.parse(args);
        const result = dates.parseDate(validated.input, validated.format);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "dates/formatDate") {
        const validated = dateSchemas.formatDateSchema.parse(args);
        const result = dates.formatDate(validated.isoDate, validated.format);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "dates/addDays") {
        const validated = dateSchemas.addDaysSchema.parse(args);
        const result = dates.addDays(validated.isoDate, validated.days);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Math utilities
      if (name === "math/round") {
        const validated = mathSchemas.roundSchema.parse(args);
        const result = math.round(validated.value, validated.decimals);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "math/clamp") {
        const validated = mathSchemas.clampSchema.parse(args);
        const result = math.clamp(validated.value, validated.min, validated.max);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Data utilities
      if (name === "data/arrays/unique") {
        const validated = dataSchemas.uniqueSchema.parse(args);
        const result = arrays.unique(validated.array);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "data/arrays/sortBy") {
        const validated = dataSchemas.sortBySchema.parse(args);
        const result = arrays.sortBy(validated.array, validated.key, validated.direction);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Encoding utilities
      if (name === "encoding/base64Encode") {
        const validated = encodingSchemas.base64EncodeSchema.parse(args);
        const result = encoding.base64Encode(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "encoding/base64Decode") {
        const validated = encodingSchemas.base64DecodeSchema.parse(args);
        const result = encoding.base64Decode(validated.input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                errorCode: "TOOL_EXECUTION_ERROR",
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run the server
 */
export async function runServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Monolith MCP Server running on stdio");
}
