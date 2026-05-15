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

### Step 3: Add to the dispatch table

**File:** [src/registry/dispatch.ts](../src/registry/dispatch.ts)

Add one entry. Both the MCP server and the CLI iterate this table, so no per-surface plumbing is required.

```typescript
entry(
  "strings/toSnakeCase",
  "Convert string to snake_case format",
  stringSchemas.toSnakeCaseSchema,
  (a) => stringCase.toSnakeCase(a.input)
),
```

Import the schema and function at the top of `dispatch.ts` if the namespace isn't already imported.

### Step 4: Add discovery extras

**File:** [src/registry/functions.ts](../src/registry/functions.ts)

Name, description, category/subcategory, and parameter info are **derived from the dispatch entry and Zod schema** — you don't repeat them. Add one `EXTRAS` entry for what *can't* be derived: examples, tags, a human-readable return description, and (optionally) a subcategory override.

```typescript
"strings/toSnakeCase": {
  subcategory: "case",   // name path `strings/toSnakeCase` has no middle segment
  returns: "string in snake_case format",
  tags: ["string", "case", "snakeCase", "transform"],
  examples: [
    { description: "camelCase", input: { input: "helloWorld" }, output: "hello_world" },
  ],
},
```

If the function name has a middle path segment (e.g. `data/arrays/groupBy`), the subcategory (`arrays`) is derived automatically and you can omit `subcategory`.

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
4. **Wire up dispatch:** Add entries to `src/registry/dispatch.ts` (import schema/util namespaces as needed)
5. **Add discovery extras:** Examples/tags/returns in `src/registry/functions.ts`
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
- [ ] Dispatch entry added to `src/registry/dispatch.ts`
- [ ] Discovery extras (examples/tags/returns) added in `src/registry/functions.ts`
- [ ] Unit tests written and passing
- [ ] Verified via CLI (`monolith <new-function> ...`) and MCP
- [ ] TypeScript compiles without errors
- [ ] All tests pass (`npm test`)
- [ ] Function executes in <10ms
- [ ] Documentation updated (if adding new category)
