# Monolith - Deterministic Utility MCP Server

A Model Context Protocol (MCP) server that exposes deterministic utility functions as tools for AI agents. Instead of relying on agents to implement common transformations and operations themselves, this server provides reliable, tested functions that agents can call directly.

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

### Utility Functions (17 functions across 7 categories)

#### String Transformations (3 functions)
- `strings/toCamelCase` - Convert to camelCase
- `strings/toKebabCase` - Convert to kebab-case
- `strings/truncate` - Truncate with suffix

#### Validation (3 functions)
- `validation/isEmail` - Validate email format
- `validation/isUrl` - Validate URL format
- `validation/isUuid` - Validate UUID format

#### Format Conversions (2 functions)
- `conversion/jsonToCsv` - Convert JSON to CSV
- `conversion/csvToJson` - Parse CSV to JSON

#### Date & Time (3 functions)
- `dates/parseDate` - Parse date to ISO format
- `dates/formatDate` - Format date with pattern
- `dates/addDays` - Add/subtract days

#### Math & Numbers (2 functions)
- `math/round` - Round to decimal places
- `math/clamp` - Clamp between min/max

#### Data Structures (2 functions)
- `data/arrays/unique` - Get unique values
- `data/arrays/sortBy` - Sort by key

#### Encoding (2 functions)
- `encoding/base64Encode` - Encode to base64
- `encoding/base64Decode` - Decode from base64

## Installation

```bash
npm install
```

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

### As an MCP Server

Add to your MCP client configuration:

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

### Example Function Call

```typescript
// Search for string functions
{
  "tool": "search_functions",
  "arguments": {
    "query": "case",
    "category": "strings"
  }
}

// Convert to camelCase
{
  "tool": "strings/toCamelCase",
  "arguments": {
    "input": "hello-world"
  }
}

// Response
{
  "success": true,
  "result": "helloWorld",
  "metadata": {
    "inputType": "string",
    "outputType": "string"
  }
}
```

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

- **Registry Pattern** - Central function registry for discovery
- **Namespace Organization** - Functions organized by category (e.g., `strings/toCamelCase`)
- **Zod Validation** - Input validation using Zod schemas
- **Performance Focus** - All functions target <10ms execution time
- **Type Safety** - Full TypeScript implementation with strict types

## Project Structure

```
src/
├── index.ts              # Server entry point
├── server.ts             # MCP server setup
├── types/                # Type definitions
├── registry/             # Function registry
├── discovery/            # Discovery tools
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

This is a scaffolding implementation. To add more functions:

1. Create utility function in `src/utils/[category]/`
2. Define Zod schema in `src/schemas/[category].ts`
3. Register metadata in `src/registry/functions.ts`
4. Add tool handler in `src/server.ts`
5. Write tests in `tests/unit/utils/`

## License

ISC
