/**
 * MCP Server configuration and setup
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { registerAllFunctions } from "./registry/functions.js";
import { dispatchEntries, getDispatchEntry } from "./registry/dispatch.js";

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

  registerAllFunctions();

  // The dispatch table is static, so the JSON Schema for each function never
  // changes after startup. Compute it once instead of on every tools/list.
  const dispatchTools = dispatchEntries.map((e) => ({
    name: e.name,
    description: e.description,
    // MCP expects JSON Schema, not raw Zod shapes. `io: "input"` so
    // fields with defaults aren't reported as required to the caller.
    inputSchema: z.toJSONSchema(e.schema, { io: "input" }),
  }));

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
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
        ...dispatchTools,
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "search_functions") {
        return handleSearchFunctions(searchFunctionsSchema.parse(args));
      }
      if (name === "list_categories") {
        return handleListCategories(listCategoriesSchema.parse(args));
      }
      if (name === "describe_function") {
        return handleDescribeFunction(describeFunctionSchema.parse(args));
      }

      const entry = getDispatchEntry(name);
      if (!entry) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const result = entry.execute(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Validation failures carry per-field detail in `ZodError.issues`. Surface
      // it as a structured INVALID_INPUT response so callers can self-correct
      // instead of getting a single flattened message.
      const payload =
        error instanceof z.ZodError
          ? {
              success: false,
              error: "Invalid input",
              errorCode: "INVALID_INPUT",
              issues: error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
                code: issue.code,
              })),
            }
          : {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
              errorCode: "TOOL_EXECUTION_ERROR",
            };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(payload, null, 2),
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
