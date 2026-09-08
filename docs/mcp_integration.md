# MCP Integration

Monolith speaks the [Model Context Protocol](https://modelcontextprotocol.io) over stdio. The same binary is a CLI when given arguments; MCP mode starts when it is launched with **no arguments and piped stdin**, which is how every MCP client invokes it.

## Configuration

### Claude Code

```bash
claude mcp add monolith -- monolith
# or, without npm link:
claude mcp add monolith -- node /absolute/path/to/monolith/dist/index.js
```

Claude Code loads only tool names and the server's `instructions` at startup and fetches schemas on demand, so the default full mode is the right choice.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "monolith": {
      "command": "node",
      "args": ["/absolute/path/to/monolith/dist/index.js"],
      "env": { "MONOLITH_TOOL_MODE": "compact" }
    }
  }
}
```

### Any stdio client

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "monolith" }));
const { tools } = await client.listTools();
const res = await client.callTool({ name: "strings_slugify", arguments: { input: "My Post" } });
```

## Tool modes

| `MONOLITH_TOOL_MODE` | Tools | Approximate size of `tools/list` |
|---|---|---|
| `full` (default) | `search_functions`, `list_categories`, `describe_function`, `batch`, `pipe`, and one tool per function (123) | ~75 KB |
| `compact` | the five above plus `run` | ~4 KB |

Use `compact` for clients that inject every tool schema into the prompt and have no tool search. Per-function validation still happens server-side and returns the same `INVALID_INPUT` envelope, so the model can self-correct from `describe_function` output.

## Tool naming

MCP tool names may not contain `/`, so `strings/toCamelCase` is exposed as `strings_toCamelCase`. `describe_function`, `run`, `batch`, and `pipe` accept either form.

## Annotations and structured output

Every tool is annotated:

```json
{ "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": false }
```

Results are returned as a text block and as `structuredContent` with the same envelope. `isError` is `true` whenever `success` is `false`. No `outputSchema` is declared (see Architecture for why).

## Calling functions

```json
{ "name": "math_round", "arguments": { "value": 1.005, "decimals": 2 } }
```
```json
{ "success": true, "result": 1.01 }
```

Validation failure:

```json
{ "name": "math_clamp", "arguments": { "value": "x" } }
```
```json
{
  "success": false,
  "error": "Invalid input",
  "errorCode": "INVALID_INPUT",
  "issues": [
    { "path": "value", "message": "Invalid input: expected number, received string", "code": "invalid_type" },
    { "path": "min", "message": "Invalid input: expected number, received undefined", "code": "invalid_type" },
    { "path": "max", "message": "Invalid input: expected number, received undefined", "code": "invalid_type" }
  ]
}
```

Function-level rejection:

```json
{ "success": false, "error": "min (5) cannot be greater than max (1)", "errorCode": "INVALID_RANGE" }
```

## Discovery

```json
{ "name": "search_functions", "arguments": { "query": "json diff" } }
```
```json
{ "success": true, "result": { "count": 2, "functions": [
  { "name": "json/diff", "toolName": "json_diff", "description": "...", "tags": ["json", "diff", "patch", "rfc6902"] },
  { "name": "strings/diff", "toolName": "strings_diff", "description": "...", "tags": ["string", "diff", "patch"] }
] } }
```

`list_categories` takes no arguments and returns `{ count, categories: [{ name, description, count }] }`. `describe_function` returns `{ name, toolName, category, description, parameters: [{ name, type, description, required, default? }], returns, tags, examples }`. Unknown names come back as `errorCode: "UNKNOWN_FUNCTION"` with `details.suggestions`.

## Composition

`batch` runs independent calls in one request; every call gets its own envelope and failures do not stop the others:

```json
{ "name": "batch", "arguments": { "calls": [
  { "name": "strings/slugify", "args": { "input": "A B" } },
  { "name": "encoding/hashSha256", "args": { "input": "A B" } }
] } }
```

`pipe` threads a value through functions; each step's result becomes the next step's primary argument (or the field named by `into`), and the first failing step is reported by index:

```json
{ "name": "pipe", "arguments": { "input": "My Post", "steps": [
  { "name": "strings/slugify" },
  { "name": "strings/truncate", "args": { "length": 5 } },
  { "name": "encoding/base64Encode" }
] } }
```

## Debugging

```bash
monolith < /dev/null                 # starts the server from a terminal; logs one line to stderr
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | monolith   # requires an initialize first for real clients
npx @modelcontextprotocol/inspector node dist/index.js
```

Logs go to stderr only; stdout is reserved for JSON-RPC.
