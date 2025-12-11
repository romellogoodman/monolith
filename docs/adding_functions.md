# Adding New Functions Guide

This guide walks through adding a new utility function to the MCP server.

## Example: Adding a toSnakeCase Function

We'll add `strings/toSnakeCase` to demonstrate the complete workflow.

### Step 1: Implement the Utility Function

**File:** [src/utils/strings/case.ts](../src/utils/strings/case.ts)

Add the function implementation:

```typescript
/**
 * Convert string to snake_case
 */
export function toSnakeCase(input: string): UtilityResponse<string> {
  try {
    const result = input
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[\s-]+/g, "_")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    return successResponse(result, {
      inputType: "string",
      outputType: "string",
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Failed to convert to snake_case",
      "CONVERSION_ERROR"
    );
  }
}
```

**Key Points:**
- Return `UtilityResponse<T>` type
- Use `successResponse()` and `errorResponse()` helpers
- Include try-catch for error handling
- Add JSDoc comment
- Keep operations synchronous and <10ms

### Step 2: Define Zod Schema

**File:** [src/schemas/strings.ts](../src/schemas/strings.ts)

Add input validation schema:

```typescript
export const toSnakeCaseSchema = z.object({
  input: z.string().describe("String to convert to snake_case"),
});
```

Export it so it can be imported by the server.

### Step 3: Register Function Metadata

**File:** [src/registry/functions.ts](../src/registry/functions.ts)

Add to `registerAllFunctions()`:

```typescript
registerFunction({
  name: "strings/toSnakeCase",
  category: "strings",
  subcategory: "case",
  description: "Convert string to snake_case format",
  parameters: [
    {
      name: "input",
      type: "string",
      description: "String to convert to snake_case",
      required: true,
    },
  ],
  returns: "string in snake_case format",
  examples: [
    {
      description: "Convert camelCase string",
      input: { input: "helloWorld" },
      output: "hello_world",
    },
    {
      description: "Convert spaced string",
      input: { input: "Hello World" },
      output: "hello_world",
    },
  ],
  tags: ["string", "case", "snakeCase", "transform"],
  performance: "< 1ms",
});
```

**Metadata Fields:**
- `name` - Full namespaced name
- `category` - Primary category (used for filtering)
- `subcategory` - Optional sub-grouping
- `description` - Brief one-line description
- `parameters` - Array of parameter info
- `returns` - Return type description
- `examples` - Usage examples (input/output pairs)
- `tags` - Searchable keywords
- `performance` - Expected execution time

### Step 4: Register MCP Tool

**File:** [src/server.ts](../src/server.ts)

Add two entries:

**4a. In `ListToolsRequestSchema` handler** (around line 70):

```typescript
{
  name: "strings/toSnakeCase",
  description: "Convert string to snake_case format",
  inputSchema: stringSchemas.toSnakeCaseSchema.shape,
},
```

**4b. In `CallToolRequestSchema` handler** (around line 200):

```typescript
if (name === "strings/toSnakeCase") {
  const validated = stringSchemas.toSnakeCaseSchema.parse(args);
  const result = stringCase.toSnakeCase(validated.input);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
```

Make sure to import the schema and function at the top of the file if needed.

### Step 5: Write Tests

**File:** [tests/unit/utils/strings.test.ts](../tests/unit/utils/strings.test.ts)

Add test cases:

```typescript
describe("toSnakeCase", () => {
  it("should convert camelCase to snake_case", () => {
    const result = toSnakeCase("helloWorld");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("hello_world");
    }
  });

  it("should convert spaced string to snake_case", () => {
    const result = toSnakeCase("Hello World");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("hello_world");
    }
  });

  it("should handle kebab-case input", () => {
    const result = toSnakeCase("hello-world");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("hello_world");
    }
  });
});
```

Import the function at the top of the test file.

### Step 6: Verify Implementation

Run all verification commands:

```bash
# Type check
npm run typecheck

# Run tests
npm test

# Build
npm run build

# Manual test (optional - start server and use MCP client)
npm run dev
```

## Adding a New Category

For a completely new category (e.g., `crypto` for cryptographic functions):

1. **Create directory:** `src/utils/crypto/`
2. **Create schema file:** `src/schemas/crypto.ts`
3. **Implement functions:** Following response format pattern
4. **Register metadata:** Add all functions in `src/registry/functions.ts`
5. **Import in server:** Add to imports and handlers in `src/server.ts`
6. **Create tests:** `tests/unit/utils/crypto.test.ts`

## Common Patterns

### Handling Optional Parameters

```typescript
export const myFunctionSchema = z.object({
  input: z.string(),
  options: z.object({
    flag: z.boolean().optional().default(false),
    limit: z.number().optional().default(100),
  }).optional(),
});
```

### Array Return Types

```typescript
export function split(input: string, delimiter: string): UtilityResponse<string[]> {
  // Implementation returns string array
  return successResponse(result, {
    inputType: "string",
    outputType: "array",
  });
}
```

### Complex Error Handling

```typescript
try {
  // Validation
  if (!isValid(input)) {
    return errorResponse("Invalid input format", "VALIDATION_ERROR", { input });
  }

  // Processing
  const result = process(input);

  return successResponse(result);
} catch (error) {
  return errorResponse(
    error instanceof Error ? error.message : "Unknown error",
    "PROCESSING_ERROR"
  );
}
```

## Checklist

- [ ] Utility function implemented in `src/utils/`
- [ ] Zod schema defined in `src/schemas/`
- [ ] Function metadata registered in `src/registry/functions.ts`
- [ ] Tool listed in `ListToolsRequestSchema` handler
- [ ] Tool handler added to `CallToolRequestSchema` handler
- [ ] Unit tests written and passing
- [ ] TypeScript compiles without errors
- [ ] All tests pass (`npm test`)
- [ ] Function executes in <10ms
- [ ] Documentation updated (if adding new category)
