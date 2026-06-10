# Monolith - Deterministic Utility Library for Agents

Monolith exposes 17+ deterministic utility functions through **two surfaces that share a single dispatch table**: an MCP stdio server and a POSIX-style CLI. Instead of relying on agents to implement common transformations themselves, they call tested functions directly — via MCP tool calls when configured, or via shell invocations when not.

## Overview

**Core Principle:** Trade agent flexibility for deterministic reliability on well-defined operations.

This MCP server acts as a "standard library" for AI agents, providing:

- Atomic, single-purpose functions
- Deterministic outputs for given inputs
- Zero ambiguity in behavior
- Composable building blocks for complex operations

## Features

### Discovery Tools

- `search_functions` - Search for functions by keywords
- `list_categories` - List all function categories
- `describe_function` - Get detailed function documentation

### Utility Functions (42 functions across 7 categories)

#### String Transformations (10 functions)
- `strings/toCamelCase` - Convert to camelCase
- `strings/toKebabCase` - Convert to kebab-case
- `strings/toSnakeCase` - Convert to snake_case
- `strings/toPascalCase` - Convert to PascalCase
- `strings/toTitleCase` - Convert to Title Case
- `strings/slugify` - Convert to a URL slug
- `strings/truncate` - Truncate with suffix
- `strings/wordCount` - Count words, characters, and lines
- `strings/escapeHtml` - Escape HTML-significant characters
- `strings/unescapeHtml` - Unescape HTML entities

#### Validation (5 functions)
- `validation/isEmail` - Validate email format
- `validation/isUrl` - Validate URL format
- `validation/isUuid` - Validate UUID format
- `validation/isJson` - Validate JSON string
- `validation/isIsoDate` - Validate ISO 8601 date

#### Format Conversions (6 functions)
- `conversion/jsonToCsv` - Convert JSON to CSV
- `conversion/csvToJson` - Parse CSV to JSON
- `conversion/yamlToJson` - Parse YAML to JSON
- `conversion/jsonToYaml` - Serialize JSON to YAML
- `conversion/xmlToJson` - Parse XML to JSON
- `conversion/markdownToHtml` - Render Markdown to HTML (output is not sanitized)

#### Date & Time (4 functions)
- `dates/parseDate` - Parse date to ISO format
- `dates/formatDate` - Format date with pattern
- `dates/addDays` - Add/subtract days
- `dates/diffDays` - Difference in calendar days

#### Math & Numbers (3 functions)
- `math/round` - Round to decimal places
- `math/clamp` - Clamp between min/max
- `math/percentage` - Compute a percentage

#### Data Structures (6 functions)
- `data/arrays/unique` - Get unique values
- `data/arrays/sortBy` - Sort by key
- `data/arrays/groupBy` - Group by key
- `data/arrays/flatten` - Flatten a nested array
- `data/objects/pick` - Pick keys from an object
- `data/objects/omit` - Omit keys from an object

#### Encoding (8 functions)
- `encoding/base64Encode` - Encode to base64
- `encoding/base64Decode` - Decode from base64
- `encoding/urlEncode` - Percent-encode a URL component
- `encoding/urlDecode` - Decode a percent-encoded component
- `encoding/hexEncode` - Encode to hex
- `encoding/hexDecode` - Decode from hex
- `encoding/hashSha256` - SHA-256 hex digest
- `encoding/hashMd5` - MD5 hex digest

## Installation

```bash
git clone <this-repo>
cd monolith
npm install
npm run build
npm link   # puts `monolith` on your PATH
```

Verify:

```bash
monolith --help
monolith strings/toCamelCase "hello world"   # → helloWorld
```

**Mode selection:**
- `monolith <args>` → CLI
- `monolith` with piped stdin (how MCP clients invoke it) → MCP stdio server
- `monolith` from a terminal → prints CLI help

To start the MCP server manually from a terminal for debugging, redirect stdin: `monolith < /dev/null`.

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Run production server
npm start

# Run tests
npm test

# Type check
npm run typecheck

# Lint code
npm run lint

# Format code
npm run format
```

## Usage

### As a CLI

After `npm link`, every registered function is reachable as `monolith <category/function>`:

```bash
# Positional arg binds to the first schema field
monolith strings/toCamelCase "hello world"
# → helloWorld

# Flags also work; multiple positionals fill fields in declaration order
monolith strings/truncate "Hello World" 8
monolith math/clamp 100 --min 0 --max 50
monolith dates/addDays --iso-date 2026-05-08T00:00:00Z --days 7

# Stdin feeds the first required field when nothing is supplied
echo "hello world" | monolith strings/toCamelCase
monolith conversion/csvToJson < data.csv
echo "[1,2,2,3]" | monolith data/arrays/unique

# --json opts into the full {success, result, metadata} envelope
monolith strings/toCamelCase "hello" --json
```

**Output rules:**
- Scalars print raw (no quotes), objects/arrays as formatted JSON.
- `--json` always emits the full envelope.
- Errors go to stderr. Exit `0` on success, `1` on usage error, `2` on execution error.

**Discovery:**

```bash
monolith list                            # list all categories
monolith list strings                    # list functions in a category
monolith search email                    # keyword search
monolith describe strings/toCamelCase    # full metadata as JSON
monolith strings/truncate --help         # per-function usage
```

### As an MCP Server

Add to your MCP client configuration (note: no arguments — that's what selects stdio mode):

```json
{
  "mcpServers": {
    "monolith": {
      "command": "monolith"
    }
  }
}
```

Or, if you haven't run `npm link`:

```json
{
  "mcpServers": {
    "monolith": {
      "command": "node",
      "args": ["/path/to/monolith/dist/index.js"]
    }
  }
}
```

Example tool call:

```json
{
  "tool": "strings/toCamelCase",
  "arguments": { "input": "hello-world" }
}
```

Returns `{ "success": true, "result": "helloWorld", "metadata": {...} }`.

## Response Format

All functions return a consistent structure:

**Success:**
```json
{
  "success": true,
  "result": <output>,
  "metadata": {
    "inputType": "string",
    "outputType": "string",
    "executionTime": 0.5
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message",
  "errorCode": "ERROR_CODE",
  "details": {}
}
```

## Architecture

Both the MCP server and the CLI are thin adapters over a shared dispatch table (`src/registry/dispatch.ts`) keyed by function name → `{ schema, execute }`. Adding a new function means one entry in that table; both surfaces pick it up.

- **Shared dispatch table** - One source, two surfaces (MCP + CLI)
- **Registry Pattern** - Central metadata registry for discovery
- **Namespace Organization** - Functions organized by category (e.g., `strings/toCamelCase`)
- **Zod Validation** - Input validation using Zod schemas, consumed uniformly by both adapters
- **Performance Focus** - All functions target <10ms execution time
- **Type Safety** - Full TypeScript implementation with strict types

## Project Structure

```
src/
├── index.ts              # Entry — dispatches MCP vs CLI on argv
├── server.ts             # MCP adapter
├── cli.ts                # CLI adapter
├── types/                # Type definitions
├── registry/
│   ├── dispatch.ts       # Shared name → {schema, execute} table
│   ├── functions.ts      # Discoverable metadata
│   └── index.ts          # Registry query API
├── discovery/            # Discovery tool handlers (search/list/describe)
├── schemas/              # Zod validation schemas
└── utils/                # Utility function implementations
    ├── strings/
    ├── validation/
    ├── conversion/
    ├── dates/
    ├── math/
    ├── data/
    └── encoding/
```

## Performance

Target performance: **<10ms per function**

- No I/O or network calls
- Stateless operations only
- In-memory processing
- Optimized algorithms

## Future Enhancements

- Additional utility categories
- Function versioning
- Custom function registration
- Performance monitoring
- Additional format conversions

## Contributing

To add a new function:

1. Create utility function in `src/utils/[category]/` returning `UtilityResponse<T>`
2. Define Zod schema in `src/schemas/[category].ts`
3. Register metadata in `src/registry/functions.ts`
4. Add one entry to `dispatchEntries` in `src/registry/dispatch.ts`
5. Write tests in `tests/unit/utils/`

Step 4 automatically surfaces the function in both the MCP tool list and the CLI — no per-surface plumbing needed.

## License

ISC
