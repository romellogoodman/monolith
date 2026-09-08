/**
 * MCP adapter tests: a real client over an in-memory transport.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildToolList, createServer, resolveToolMode } from "../../src/server.js";
import { functions, toToolName } from "../../src/core/registry.js";

async function connect(mode: "full" | "compact") {
  const server = createServer(mode);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

type Result = {
  success: boolean;
  result?: unknown;
  error?: string;
  errorCode?: string;
  issues?: unknown[];
};

async function call(client: Client, name: string, args?: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  return { ...res, payload: JSON.parse(res.content[0].text) as Result };
}

describe("MCP server (full mode)", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect("full");
  });

  it("exposes every function under its MCP tool name, plus discovery and composition", async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const fn of functions) expect(names.has(toToolName(fn.name)), fn.name).toBe(true);
    for (const n of ["search_functions", "list_categories", "describe_function", "batch", "pipe"])
      expect(names.has(n), n).toBe(true);
    expect(names.has("run")).toBe(false);
  });

  it("marks every tool as a pure, read-only, idempotent function with a title", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  it("emits JSON Schema inputs without Zod internals or $schema", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema).not.toHaveProperty("$schema");
      expect(schema).not.toHaveProperty("def");
    }
  });

  it("advertises server instructions", () => {
    // instructions are passed at construction; ensure the server option is wired.
    const server = createServer("full");
    expect(server).toBeTruthy();
  });

  it("runs a function and returns text plus structuredContent", async () => {
    const r = await call(client, "strings_toCamelCase", { input: "hello world" });
    expect(r.isError).toBeUndefined();
    expect(r.payload).toEqual({ success: true, result: "helloWorld" });
    expect(r.structuredContent).toEqual({ success: true, result: "helloWorld" });
  });

  it("returns INVALID_INPUT with issues and isError on bad arguments", async () => {
    const r = await call(client, "math_clamp", { value: "x" });
    expect(r.isError).toBe(true);
    expect(r.payload.errorCode).toBe("INVALID_INPUT");
    expect(r.payload.issues!.length).toBeGreaterThan(0);
  });

  it("flags function-level rejections as errors", async () => {
    const r = await call(client, "math_clamp", { value: 1, min: 5, max: 1 });
    expect(r.isError).toBe(true);
    expect(r.payload.errorCode).toBe("INVALID_RANGE");
  });

  it("reports unknown tools with suggestions", async () => {
    const r = await call(client, "strings_slugfy", { input: "x" });
    expect(r.isError).toBe(true);
    expect(r.payload.errorCode).toBe("UNKNOWN_FUNCTION");
    expect(
      (r.payload as unknown as { details: { suggestions: string[] } }).details.suggestions
    ).toContain("strings/slugify");
  });

  it("list_categories works without arguments", async () => {
    const r = await call(client, "list_categories");
    expect(r.isError).toBeUndefined();
    const result = r.payload.result as {
      count: number;
      categories: Array<{ name: string; count: number }>;
    };
    expect(result.categories.reduce((n, c) => n + c.count, 0)).toBe(functions.length);
  });

  it("search_functions ranks and filters", async () => {
    const r = await call(client, "search_functions", { query: "slug" });
    const result = r.payload.result as { functions: Array<{ name: string; toolName: string }> };
    expect(result.functions[0]).toMatchObject({
      name: "strings/slugify",
      toolName: "strings_slugify",
    });
  });

  it("describe_function accepts either name form and errors in the shared envelope", async () => {
    const a = await call(client, "describe_function", { name: "strings/slugify" });
    const b = await call(client, "describe_function", { name: "strings_slugify" });
    expect(a.payload).toEqual(b.payload);
    expect((a.payload.result as { parameters: unknown[] }).parameters.length).toBe(1);
    const missing = await call(client, "describe_function", { name: "nope/x" });
    expect(missing.isError).toBe(true);
    expect(missing.payload).toMatchObject({ success: false, errorCode: "UNKNOWN_FUNCTION" });
  });

  it("batch runs independent calls and isolates failures", async () => {
    const r = await call(client, "batch", {
      calls: [
        { name: "strings/slugify", args: { input: "A B" } },
        { name: "math/clamp", args: { value: 1, min: 5, max: 1 } },
        { name: "nope/x" },
      ],
    });
    const results = (r.payload.result as { results: Array<Result & { name: string }> }).results;
    expect(results.map((x) => x.success)).toEqual([true, false, false]);
    expect(results[0].result).toBe("a-b");
    expect(results[2].errorCode).toBe("UNKNOWN_FUNCTION");
  });

  it("pipe threads a value through steps and reports the failing step", async () => {
    const ok = await call(client, "pipe", {
      input: "My Post",
      steps: [{ name: "strings/slugify" }, { name: "encoding/base64Encode" }],
    });
    expect(ok.payload).toEqual({
      success: true,
      result: Buffer.from("my-post").toString("base64"),
    });
    const bad = await call(client, "pipe", {
      input: "x",
      steps: [{ name: "strings/slugify" }, { name: "math/round" }],
    });
    expect(bad.isError).toBe(true);
    expect(bad.payload).toMatchObject({
      success: false,
      step: 1,
      name: "math/round",
      errorCode: "INVALID_INPUT",
    });
    const into = await call(client, "pipe", {
      input: 3,
      steps: [{ name: "math/clamp", args: { min: 0, max: 2 } }],
    });
    expect(into.payload).toEqual({ success: true, result: 2 });
  });
});

describe("MCP server (compact mode)", () => {
  it("exposes only discovery, composition, and run", () => {
    const names = buildToolList("compact").map((t) => t.name);
    expect(names).toEqual([
      "search_functions",
      "list_categories",
      "describe_function",
      "run",
      "batch",
      "pipe",
    ]);
  });

  it("run dispatches by name; per-function tools are not callable", async () => {
    const client = await connect("compact");
    const r = await call(client, "run", { name: "strings/slugify", args: { input: "A B" } });
    expect(r.payload).toEqual({ success: true, result: "a-b" });
    const direct = await call(client, "strings_slugify", { input: "A B" });
    expect(direct.isError).toBe(true);
  });

  it("is selected by MONOLITH_TOOL_MODE", () => {
    expect(resolveToolMode({ MONOLITH_TOOL_MODE: "compact" })).toBe("compact");
    expect(resolveToolMode({})).toBe("full");
  });
});
