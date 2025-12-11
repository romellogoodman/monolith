# Monolith - Deterministic Utility MCP Server

## What

A Model Context Protocol (MCP) server providing 17+ deterministic utility functions across 7 categories for AI agents. Built with TypeScript, ESM modules, and the official MCP SDK.

**Tech Stack:**
- TypeScript 5.7 with strict mode
- Node.js with ESM (type: "module")
- MCP SDK (@modelcontextprotocol/sdk)
- Zod for validation
- Vitest for testing

**Project Structure:**
```
src/
├── index.ts              # Server entry point
├── server.ts             # MCP server setup + tool registration
├── types/                # Shared TypeScript types
├── registry/             # Central function registry + metadata
├── discovery/            # Search/list/describe tools
├── schemas/              # Zod validation schemas (one per category)
└── utils/                # Utility function implementations by category
    ├── strings/, validation/, conversion/
    ├── dates/, math/, data/, encoding/
```

## Why

**Core Principle:** Trade agent flexibility for deterministic reliability on well-defined operations.

Instead of agents implementing string manipulation or date parsing with potential errors, this server provides tested, consistent functions. All functions return a standard `{success, result, error}` format.

**Registry Pattern:** Central metadata enables discovery - agents can search for functions, list categories, and get detailed documentation via MCP tools.

## How

### Development Commands
```bash
npm run dev          # Hot reload development server
npm test             # Run test suite (Vitest)
npm run typecheck    # TypeScript validation
npm run build        # Compile to dist/
```

### Adding New Functions
See [docs/adding_functions.md](docs/adding_functions.md) for the complete workflow.

**Quick Reference:**
1. Implement in `src/utils/[category]/`
2. Add Zod schema in `src/schemas/[category].ts`
3. Register metadata in `src/registry/functions.ts`
4. Add tool handler in `src/server.ts`
5. Write tests in `tests/unit/utils/`

### Response Format Convention
All utility functions return `UtilityResponse<T>`:
```typescript
// Success
{ success: true, result: T, metadata?: {...} }

// Error
{ success: false, error: string, errorCode: string }
```

Use helpers: `successResponse(result, metadata?)` and `errorResponse(error, code)`

### Function Naming
Use namespace pattern: `category/functionName` (e.g., `strings/toCamelCase`, `dates/parseDate`)

### Performance Target
All functions should execute in <10ms. No I/O, network calls, or external state.

## Additional Documentation

- [Architecture Overview](docs/architecture.md) - Registry, discovery, and tool patterns
- [Adding Functions Guide](docs/adding_functions.md) - Complete walkthrough with examples
- [Testing Guide](docs/testing.md) - Unit test patterns and integration tests
- [MCP Integration](docs/mcp_integration.md) - Using this server with MCP clients
