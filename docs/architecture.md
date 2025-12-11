# Architecture Overview

## Core Components

### 1. Function Registry Pattern

**Files:** [src/registry/index.ts](../src/registry/index.ts), [src/registry/functions.ts](../src/registry/functions.ts)

The registry is a central in-memory store of function metadata. All utility functions register themselves with:
- Name (namespace pattern: `category/functionName`)
- Category and optional subcategory
- Description and parameters
- Examples and tags
- Performance characteristics

**Key Methods:**
- `registerFunction(metadata)` - Add function to registry
- `getAllFunctions()` - Get all registered functions
- `searchFunctions(query, category?)` - Search by keywords
- `getFunction(name)` - Get specific function metadata
- `getCategories()` - List all categories with counts

### 2. Discovery Tools

**Files:** [src/discovery/](../src/discovery/)

Three MCP tools enable function discovery:

- **`search_functions`** - Fuzzy search across names, descriptions, tags, and categories
- **`list_categories`** - Returns all categories with function counts
- **`describe_function`** - Full documentation for a specific function

These tools query the registry and return structured data.

### 3. Tool Registration Pattern

**File:** [src/server.ts](../src/server.ts:64-209)

The server registers two types of handlers:

1. **`ListToolsRequestSchema`** - Returns all available tools with schemas
2. **`CallToolRequestSchema`** - Executes tool calls:
   - Parses input with Zod schema
   - Calls utility function
   - Returns JSON-stringified result

### 4. Response Format

**File:** [src/types/responses.ts](../src/types/responses.ts)

All functions return `UtilityResponse<T>`:
- `SuccessResponse<T>` - Contains result and optional metadata
- `ErrorResponse` - Contains error message and code

Helper functions enforce consistency:
- `successResponse(result, metadata?)`
- `errorResponse(error, errorCode, details?)`

### 5. Validation Layer

**Files:** [src/schemas/](../src/schemas/)

Each category has a Zod schemas file defining input validation:
- `strings.ts` - Case transformations, manipulation
- `validation.ts` - Email, URL, UUID validators
- `conversion.ts` - Format conversions (JSON↔CSV)
- `dates.ts` - Date parsing, formatting, arithmetic
- `math.ts` - Numeric operations
- `data.ts` - Array and object operations
- `encoding.ts` - Base64, URL encoding

Zod schemas are exported and used in:
1. Tool registration (`inputSchema` field)
2. Request handling (validation before execution)

## Data Flow

```
MCP Client Request
  ↓
Server CallToolRequestSchema handler
  ↓
Zod schema validation
  ↓
Utility function execution
  ↓
Response formatting (success/error)
  ↓
JSON stringification
  ↓
MCP Client Response
```

## Adding New Categories

To add a new category:

1. Create `src/utils/[category]/` directory
2. Create `src/schemas/[category].ts` with Zod schemas
3. Implement functions following response format
4. Register functions in `src/registry/functions.ts`
5. Add tool handlers in `src/server.ts`

## Performance Considerations

- **Registry lookup**: O(n) search, optimized with array filters
- **Function execution**: Target <10ms per function
- **No async I/O**: All operations are synchronous and stateless
- **Memory-only**: No database or file system operations

## Extension Points

The architecture supports growth:
- Add new utility categories without changing core structure
- Discovery tools scale with any number of functions
- Registry can be enhanced with caching or indexing
- Response format can include execution time tracking
