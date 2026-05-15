/**
 * Tests for the MCP adapter. Wires createServer() to an in-memory
 * transport and exercises list_tools / call_tool as a real client would.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { dispatchEntries } from "../../src/registry/dispatch.js";

describe("MCP server", () => {
  let client: Client;

  beforeAll(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  describe("list_tools", () => {
    it("exposes every dispatch entry as a tool", async () => {
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      for (const entry of dispatchEntries) {
        expect(names.has(entry.name), `missing tool ${entry.name}`).toBe(true);
      }
    });

    it("emits JSON Schema (not raw Zod shapes) for every tool inputSchema", async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        const schema = tool.inputSchema as Record<string, unknown>;
        // A JSON Schema object always declares its type.
        expect(schema.type, `${tool.name} inputSchema.type`).toBe("object");
        // Raw Zod shapes have no `properties` key; JSON Schema objects do
        // (absent only for the no-arg `list_categories` handler).
        if (tool.name !== "list_categories") {
          expect(schema.properties, `${tool.name} inputSchema.properties`).toBeTypeOf("object");
        }
        // Zod internals leak as `def`/`~standard` keys at the top level —
        // make sure none of those escaped.
        expect(schema).not.toHaveProperty("def");
        expect(schema).not.toHaveProperty("~standard");
        for (const prop of Object.values(
          (schema.properties ?? {}) as Record<string, Record<string, unknown>>
        )) {
          expect(prop).not.toHaveProperty("def");
          expect(prop).not.toHaveProperty("~standard");
          // `type` is optional in JSON Schema (absent means "any", e.g. z.unknown()).
          if (prop.type !== undefined) {
            expect(typeof prop.type === "string" || Array.isArray(prop.type)).toBe(true);
          }
        }
      }
    });

    it("does not report defaulted fields as required", async () => {
      const { tools } = await client.listTools();
      const truncate = tools.find((t) => t.name === "strings/truncate");
      expect(truncate).toBeDefined();
      const required = (truncate!.inputSchema as { required?: string[] }).required ?? [];
      expect(required).toContain("input");
      expect(required).toContain("length");
      expect(required).not.toContain("suffix"); // has .default("...")
    });
  });

  describe("call_tool", () => {
    it("executes a dispatch entry and returns the UtilityResponse envelope", async () => {
      const res = await client.callTool({
        name: "strings/toCamelCase",
        arguments: { input: "hello world" },
      });
      const content = res.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toEqual(expect.objectContaining({ success: true, result: "helloWorld" }));
    });

    it("returns an error envelope for unknown tools without crashing", async () => {
      const res = await client.callTool({ name: "nope/missing", arguments: {} });
      expect(res.isError).toBe(true);
      const content = res.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.errorCode).toBe("TOOL_EXECUTION_ERROR");
    });
  });
});
