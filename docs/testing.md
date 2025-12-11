# Testing Guide

## Test Structure

Tests are organized in `tests/` directory mirroring the `src/` structure:

```
tests/
├── unit/
│   ├── registry.test.ts          # Registry functionality
│   └── utils/
│       ├── strings.test.ts       # String utilities
│       ├── validation.test.ts    # Validation utilities
│       └── ...                   # One file per utility category
└── integration/
    └── server.test.ts            # Server integration tests (future)
```

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Run specific test file
npx vitest tests/unit/utils/strings.test.ts

# Run with coverage (add to package.json if needed)
npx vitest --coverage
```

## Writing Unit Tests

### Test Structure Pattern

**File:** [tests/unit/utils/strings.test.ts](../tests/unit/utils/strings.test.ts)

```typescript
import { describe, it, expect } from "vitest";
import { toCamelCase, toKebabCase } from "../../../src/utils/strings/case.js";

describe("String Case Utilities", () => {
  describe("toCamelCase", () => {
    it("should convert hyphenated string to camelCase", () => {
      const result = toCamelCase("hello-world");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("helloWorld");
      }
    });

    it("should handle edge case: empty string", () => {
      const result = toCamelCase("");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe("");
      }
    });
  });
});
```

### Testing Response Format

Always test both success and error cases:

```typescript
describe("myFunction", () => {
  // Success case
  it("should return success response with correct result", () => {
    const result = myFunction("valid input");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe("expected output");
      expect(result.metadata?.inputType).toBe("string");
      expect(result.metadata?.outputType).toBe("string");
    }
  });

  // Error case
  it("should return error response for invalid input", () => {
    const result = myFunction("invalid");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("expected error message");
      expect(result.errorCode).toBe("EXPECTED_ERROR_CODE");
    }
  });
});
```

### Type Narrowing Pattern

TypeScript's type narrowing with `result.success` ensures type safety:

```typescript
const result = myFunction(input);

// Type: UtilityResponse<T> (union type)
expect(result.success).toBe(true);

if (result.success) {
  // Type: SuccessResponse<T>
  result.result;        // Accessible
  result.metadata;      // Accessible
  // result.error;      // Not accessible (TypeScript error)
} else {
  // Type: ErrorResponse
  result.error;         // Accessible
  result.errorCode;     // Accessible
  // result.result;     // Not accessible (TypeScript error)
}
```

## Testing Registry Functions

**File:** [tests/unit/registry.test.ts](../tests/unit/registry.test.ts)

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import {
  getAllFunctions,
  getCategories,
  searchFunctions,
  getFunction,
} from "../../src/registry/index.js";
import { registerAllFunctions } from "../../src/registry/functions.js";

describe("Function Registry", () => {
  beforeAll(() => {
    registerAllFunctions();
  });

  it("should return all registered functions", () => {
    const functions = getAllFunctions();
    expect(functions.length).toBeGreaterThan(0);
    expect(functions[0]).toHaveProperty("name");
    expect(functions[0]).toHaveProperty("category");
  });

  it("should search functions by keyword", () => {
    const results = searchFunctions("camel");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain("Camel");
  });
});
```

## Test Coverage Goals

### Essential Coverage
- ✅ All utility functions (happy path)
- ✅ Error cases for each function
- ✅ Registry search/lookup operations
- ✅ Edge cases (empty strings, zero values, boundary conditions)

### Good-to-Have Coverage
- Integration tests for MCP server lifecycle
- Discovery tools (search_functions, list_categories, describe_function)
- Zod schema validation failures
- Complex input scenarios

### Out of Scope
- MCP SDK internals (covered by SDK tests)
- Third-party library behavior (validator, Papa Parse, date-fns)

## Common Test Patterns

### Testing Array Operations

```typescript
it("should return unique values", () => {
  const result = unique([1, 2, 2, 3, 3, 3]);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.result).toEqual([1, 2, 3]);
  }
});
```

### Testing Date Functions

```typescript
it("should parse date to ISO format", () => {
  const result = parseDate("2025-12-11");
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }
});
```

### Testing Validation Functions

```typescript
it("should validate correct email", () => {
  const result = isEmail("user@example.com");
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.result).toBe(true);
  }
});

it("should reject invalid email", () => {
  const result = isEmail("not-an-email");
  expect(result.success).toBe(true);  // Function succeeds
  if (result.success) {
    expect(result.result).toBe(false);  // But validation fails
  }
});
```

### Testing Error Handling

```typescript
it("should handle invalid input gracefully", () => {
  const result = clamp(100, 50, 10);  // min > max
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.errorCode).toBe("INVALID_RANGE");
    expect(result.error).toContain("Min value cannot be greater than max");
  }
});
```

## Debugging Failed Tests

```bash
# Run single test with verbose output
npx vitest tests/unit/utils/strings.test.ts --reporter=verbose

# Run tests matching pattern
npx vitest --grep "toCamelCase"

# Run only failing tests
npx vitest --only
```

## Pre-Commit Testing

Before committing changes:

```bash
# Full verification suite
npm run typecheck  # TypeScript errors
npm test           # All tests
npm run build      # Compilation
```

## Adding Integration Tests

Future integration tests should verify:
- Server startup and shutdown
- Tool discovery via MCP protocol
- End-to-end tool execution
- Error handling at protocol level

Example structure (not yet implemented):

```typescript
// tests/integration/server.test.ts
describe("MCP Server", () => {
  let server: Server;

  beforeAll(() => {
    server = createServer();
  });

  it("should list all available tools", async () => {
    // Test ListTools request
  });

  it("should execute tool and return result", async () => {
    // Test CallTool request
  });
});
```
