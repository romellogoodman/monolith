/**
 * MCP stdio adapter over the shared registry.
 *
 * Tool modes (MONOLITH_TOOL_MODE):
 *   full    (default) one tool per function plus discovery, batch, and pipe.
 *   compact discovery, batch, pipe, and a single `run` tool — a few hundred
 *           tokens of tool definitions for clients without tool search.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { execute } from "./core/define.js";
import {
  ErrorCode,
  errorResponse,
  successResponse,
  validationErrorResponse,
} from "./core/responses.js";
import {
  VERSION,
  describeFunction,
  functions,
  getFunction,
  inputJsonSchema,
  listCategories,
  searchFunctions,
  suggestFunctions,
  toToolName,
} from "./core/registry.js";
import { batchSchema, callSchema, pipeSchema, runBatch, runCall, runPipe } from "./core/compose.js";

export type ToolMode = "full" | "compact";

/** Every Monolith tool is a pure function: safe to call freely and to retry. */
const PURE: Tool["annotations"] = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const INSTRUCTIONS = `Monolith provides deterministic, side-effect-free utility functions (strings, validation, conversion, dates, math, data, encoding, json, semver, paths, urls, regex, color). Call them instead of writing one-off code or shell one-liners for string case conversion, slugs, hashing, base64, JSON/YAML/CSV/XML conversion, date arithmetic in UTC, rounding, JSON querying/diffing, semver ranges, path and URL manipulation, and regex testing. Every result is the same for the same input. Use search_functions to find a function by keyword, describe_function for its parameters and examples, batch to run several independent calls at once, and pipe to chain functions so the output of one feeds the next. Responses are JSON: { success: true, result } or { success: false, error, errorCode, issues? }.`;

const searchSchema = z.object({
  query: z.string().describe("Keywords to match against names, descriptions, and tags"),
  category: z.string().optional().describe("Restrict to one category, e.g. strings"),
});
const describeSchema = z.object({
  name: z.string().describe("Function name, e.g. strings/toCamelCase or strings_toCamelCase"),
});
const runSchema = callSchema;

function toolDef(name: string, title: string, description: string, schema: z.ZodObject): Tool {
  const inputSchema = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete inputSchema.$schema;
  return {
    name,
    title,
    description,
    inputSchema: inputSchema as Tool["inputSchema"],
    annotations: { ...PURE, title },
  };
}

function functionTool(fn: (typeof functions)[number]): Tool {
  // Keep per-tool descriptions short: with 100+ tools the list is what costs
  // context. Examples and parameter docs are one describe_function call away.
  const title = fn.name.split("/").pop() ?? fn.name;
  return {
    name: toToolName(fn.name),
    title,
    description: `${fn.description} Returns ${fn.returns}.`,
    inputSchema: inputJsonSchema(fn) as Tool["inputSchema"],
    annotations: { ...PURE, title },
  };
}

export function buildToolList(mode: ToolMode): Tool[] {
  const discovery = [
    toolDef(
      "search_functions",
      "Search functions",
      "Find utility functions by keyword. Returns names, descriptions, and tags, best matches first.",
      searchSchema
    ),
    toolDef(
      "list_categories",
      "List categories",
      "List function categories with a description and function count for each.",
      z.object({})
    ),
    toolDef(
      "describe_function",
      "Describe function",
      "Full details for one function: parameters (with types, defaults, and which are required), return value, tags, and worked examples.",
      describeSchema
    ),
  ];
  const compose = [
    toolDef(
      "batch",
      "Batch calls",
      "Run several independent function calls in one request. Each call gets its own { success, result | error } entry; a failure does not stop the others.",
      batchSchema
    ),
    toolDef(
      "pipe",
      "Pipe functions",
      "Chain functions: the input is passed to the first step, and each step's result becomes the next step's primary argument. Stops at the first failing step and reports its index.",
      pipeSchema
    ),
  ];
  if (mode === "compact") {
    return [
      ...discovery,
      toolDef(
        "run",
        "Run function",
        "Run any Monolith function by name with an arguments object. Use describe_function first to see its parameters.",
        runSchema
      ),
      ...compose,
    ];
  }
  return [...discovery, ...compose, ...functions.map(functionTool)];
}

function textResult(payload: unknown, isError = false) {
  const structured =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(structured && { structuredContent: structured }),
    ...(isError && { isError: true }),
  };
}

/** Parse discovery/compose arguments with the same INVALID_INPUT envelope functions use. */
function parseArgs<S extends z.ZodObject>(
  schema: S,
  args: unknown
):
  | { ok: true; value: z.output<S> }
  | { ok: false; response: ReturnType<typeof validationErrorResponse> } {
  const parsed = schema.safeParse(args ?? {});
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, response: validationErrorResponse(parsed.error) };
}

export function handleToolCall(name: string, args: unknown, mode: ToolMode) {
  switch (name) {
    case "search_functions": {
      const p = parseArgs(searchSchema, args);
      if (!p.ok) return textResult(p.response, true);
      const results = searchFunctions(p.value.query, p.value.category).map((fn) => ({
        name: fn.name,
        toolName: toToolName(fn.name),
        description: fn.description,
        tags: fn.tags,
      }));
      return textResult(successResponse({ count: results.length, functions: results }));
    }
    case "list_categories": {
      const categories = listCategories();
      return textResult(successResponse({ count: categories.length, categories }));
    }
    case "describe_function": {
      const p = parseArgs(describeSchema, args);
      if (!p.ok) return textResult(p.response, true);
      const fn = getFunction(p.value.name);
      if (!fn) {
        return textResult(
          errorResponse(`Unknown function: ${p.value.name}`, ErrorCode.UNKNOWN_FUNCTION, {
            suggestions: suggestFunctions(p.value.name),
          }),
          true
        );
      }
      return textResult(successResponse(describeFunction(fn)));
    }
    case "batch": {
      const p = parseArgs(batchSchema, args);
      if (!p.ok) return textResult(p.response, true);
      const results = runBatch(p.value.calls);
      return textResult(successResponse({ results }));
    }
    case "pipe": {
      const p = parseArgs(pipeSchema, args);
      if (!p.ok) return textResult(p.response, true);
      const result = runPipe(p.value.input, p.value.steps);
      return textResult(result, !result.success);
    }
    case "run": {
      if (mode !== "compact") break;
      const p = parseArgs(runSchema, args);
      if (!p.ok) return textResult(p.response, true);
      const result = runCall(p.value);
      return textResult(result, !result.success);
    }
  }
  const fn = mode === "full" ? getFunction(name) : undefined;
  if (!fn) {
    return textResult(
      errorResponse(`Unknown tool: ${name}`, ErrorCode.UNKNOWN_FUNCTION, {
        suggestions: suggestFunctions(name),
      }),
      true
    );
  }
  const result = execute(fn, args);
  return textResult(result, !result.success);
}

export function resolveToolMode(env: NodeJS.ProcessEnv = process.env): ToolMode {
  return env.MONOLITH_TOOL_MODE === "compact" ? "compact" : "full";
}

export function createServer(mode: ToolMode = resolveToolMode()) {
  const server = new Server(
    { name: "monolith", version: VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );
  // The registry is static, so the tool list (and every JSON Schema in it) is
  // computed once. Order is stable, which keeps client prompt caches warm.
  const tools = buildToolList(mode);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments, mode)
  );
  return server;
}

export async function runServer() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`Monolith ${VERSION} MCP server running on stdio (${resolveToolMode()} mode)`);
}
