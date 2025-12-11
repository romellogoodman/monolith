# MCP Integration Guide

## Using the Server with MCP Clients

This server implements the [Model Context Protocol](https://modelcontextprotocol.io) and can be used with any MCP-compatible client.

## Configuration

### Claude Desktop

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "monolith": {
      "command": "node",
      "args": ["/absolute/path/to/monolith/dist/index.js"]
    }
  }
}
```

After editing, restart Claude Desktop.

### Other MCP Clients

For any MCP client supporting stdio transport:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/path/to/monolith/dist/index.js"],
});

const client = new Client(
  {
    name: "my-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

await client.connect(transport);
```

## Available Tools

### Discovery Tools

**1. search_functions**
Search for utility functions by keywords.

```json
{
  "name": "search_functions",
  "arguments": {
    "query": "case",
    "category": "strings"
  }
}
```

Response:
```json
{
  "query": "case",
  "category": "strings",
  "count": 2,
  "functions": [
    {
      "name": "strings/toCamelCase",
      "category": "strings",
      "description": "Convert string to camelCase format",
      "tags": ["string", "case", "camelCase", "transform"]
    },
    {
      "name": "strings/toKebabCase",
      "category": "strings",
      "description": "Convert string to kebab-case format",
      "tags": ["string", "case", "kebabCase", "transform"]
    }
  ]
}
```

**2. list_categories**
List all function categories.

```json
{
  "name": "list_categories",
  "arguments": {}
}
```

Response:
```json
{
  "count": 7,
  "categories": [
    { "name": "conversion", "description": "Conversion utility functions", "count": 2 },
    { "name": "data", "description": "Data utility functions", "count": 2 },
    { "name": "dates", "description": "Dates utility functions", "count": 3 },
    { "name": "encoding", "description": "Encoding utility functions", "count": 2 },
    { "name": "math", "description": "Math utility functions", "count": 2 },
    { "name": "strings", "description": "Strings utility functions", "count": 3 },
    { "name": "validation", "description": "Validation utility functions", "count": 3 }
  ]
}
```

**3. describe_function**
Get detailed information about a specific function.

```json
{
  "name": "describe_function",
  "arguments": {
    "name": "strings/toCamelCase"
  }
}
```

Response includes full metadata: parameters, return type, examples, tags, performance.

### Utility Functions

All utility functions return a consistent format:

**Success Response:**
```json
{
  "success": true,
  "result": "helloWorld",
  "metadata": {
    "inputType": "string",
    "outputType": "string"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Invalid input format",
  "errorCode": "VALIDATION_ERROR"
}
```

## Example Usage Workflows

### 1. Discover and Use a Function

```javascript
// Step 1: Search for functions
const searchResult = await client.callTool({
  name: "search_functions",
  arguments: { query: "validate email" }
});

// Step 2: Use discovered function
const result = await client.callTool({
  name: "validation/isEmail",
  arguments: { input: "user@example.com" }
});

// result.content[0].text contains JSON response
const response = JSON.parse(result.content[0].text);
if (response.success) {
  console.log("Valid email:", response.result); // true
}
```

### 2. String Transformations

```javascript
// Convert to camelCase
await client.callTool({
  name: "strings/toCamelCase",
  arguments: { input: "hello-world" }
});
// Returns: { success: true, result: "helloWorld" }

// Convert to kebab-case
await client.callTool({
  name: "strings/toKebabCase",
  arguments: { input: "helloWorld" }
});
// Returns: { success: true, result: "hello-world" }

// Truncate
await client.callTool({
  name: "strings/truncate",
  arguments: { input: "Hello World", length: 8, suffix: "..." }
});
// Returns: { success: true, result: "Hello..." }
```

### 3. Date Operations

```javascript
// Parse date
await client.callTool({
  name: "dates/parseDate",
  arguments: { input: "2025-12-11" }
});
// Returns ISO string

// Format date
await client.callTool({
  name: "dates/formatDate",
  arguments: {
    isoDate: "2025-12-11T00:00:00.000Z",
    format: "MMMM d, yyyy"
  }
});
// Returns: { success: true, result: "December 11, 2025" }

// Add days
await client.callTool({
  name: "dates/addDays",
  arguments: {
    isoDate: "2025-12-11T00:00:00.000Z",
    days: 7
  }
});
// Returns date 7 days later
```

### 4. Data Transformations

```javascript
// Convert JSON to CSV
await client.callTool({
  name: "conversion/jsonToCsv",
  arguments: {
    input: [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 }
    ]
  }
});

// Get unique values
await client.callTool({
  name: "data/arrays/unique",
  arguments: { array: [1, 2, 2, 3, 3, 3] }
});
// Returns: { success: true, result: [1, 2, 3] }

// Sort array
await client.callTool({
  name: "data/arrays/sortBy",
  arguments: {
    array: [{ name: "Bob", age: 25 }, { name: "Alice", age: 30 }],
    key: "age",
    direction: "asc"
  }
});
```

## Error Handling

Always check the `success` field before accessing results:

```javascript
const result = await client.callTool({
  name: "validation/isEmail",
  arguments: { input: "maybe-email" }
});

const response = JSON.parse(result.content[0].text);

if (response.success) {
  // Access response.result safely
  console.log("Result:", response.result);
} else {
  // Handle error
  console.error(`Error: ${response.error} (${response.errorCode})`);
  if (response.details) {
    console.error("Details:", response.details);
  }
}
```

## Performance Considerations

- All functions execute in <10ms
- No network calls or I/O operations
- Functions are stateless and deterministic
- Safe for concurrent calls

## Troubleshooting

### Server Not Starting

```bash
# Verify build is up to date
npm run build

# Check for TypeScript errors
npm run typecheck

# Test manually
node dist/index.js
```

The server communicates via stdio - you should see no output if running correctly. Use `console.error()` for debug messages (stdout is reserved for MCP protocol).

### Tool Not Found

Verify the tool is registered:
```bash
# Start server and list tools via MCP client
# Or inspect src/server.ts ListToolsRequestSchema handler
```

### Invalid Input Schema

Check that your input matches the Zod schema defined in `src/schemas/[category].ts`.

## Development Mode

For testing during development:

```bash
# Run with hot reload
npm run dev

# In another terminal, test with your MCP client
# Or use MCP Inspector: https://github.com/modelcontextprotocol/inspector
```

## Security Note

This server executes deterministic utility functions only. It does not:
- Execute arbitrary code
- Access the file system
- Make network requests
- Maintain persistent state

All inputs are validated with Zod schemas before execution.
