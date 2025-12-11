# Deterministic Utility MCP Server

## Overview

A Model Context Protocol (MCP) server that exposes thousands of small, deterministic utility functions as tools for AI agents. Instead of relying on agents to implement common transformations and operations themselves (with potential for errors), this server provides reliable, tested functions that agents can call directly.

**Core Principle:** Trade agent flexibility for deterministic reliability on well-defined operations.

---

## Problem Statement

Current AI agents face several challenges with routine operations:

1. **Inconsistency** — Agents may implement the same transformation differently across sessions
1. **Error-prone** — String manipulation, date parsing, and format conversions are common failure points
1. **Token waste** — Agents spend context reasoning through operations that should be simple function calls
1. **Reinvention** — Every agent session rediscovers how to do basic utilities

---

## Proposed Solution

An MCP server acting as a “standard library” for AI agents, providing:

- Atomic, single-purpose functions
- Deterministic outputs for given inputs
- Zero ambiguity in behavior
- Composable building blocks for complex operations

---

## Function Categories

### String Transformations

- `toCamelCase(input)` → “helloWorld”
- `toKebabCase(input)` → “hello-world”
- `toSnakeCase(input)` → “hello_world”
- `toPascalCase(input)` → “HelloWorld”
- `toTitleCase(input)` → “Hello World”
- `slugify(input)` → “hello-world”
- `truncate(input, length, suffix)`
- `padLeft(input, length, char)`
- `padRight(input, length, char)`

### Validation

- `isEmail(input)` → boolean
- `isUrl(input)` → boolean
- `isUuid(input)` → boolean
- `isIsoDate(input)` → boolean
- `isJson(input)` → boolean
- `matchesPattern(input, regex)` → boolean

### Format Conversions

- `jsonToCsv(input)`
- `csvToJson(input)`
- `xmlToJson(input)`
- `yamlToJson(input)`
- `markdownToHtml(input)`

### Date & Time

- `parseDate(input, format)` → ISO string
- `formatDate(isoDate, format)`
- `addDays(isoDate, days)`
- `diffDays(date1, date2)`
- `getTimezone(isoDate)`

### Math & Numbers

- `round(value, decimals)`
- `formatCurrency(value, locale, currency)`
- `parseNumber(input, locale)`
- `percentage(value, total)`
- `clamp(value, min, max)`

### Data Structures

- `unique(array)`
- `flatten(nestedArray)`
- `groupBy(array, key)`
- `sortBy(array, key, direction)`
- `pick(object, keys)`
- `omit(object, keys)`

### Encoding

- `base64Encode(input)`
- `base64Decode(input)`
- `urlEncode(input)`
- `urlDecode(input)`
- `hashMd5(input)`
- `hashSha256(input)`

---

## Discovery Mechanism

Given the large number of functions, agents need efficient discovery:

### Search Tool

```
search_functions(query: string, category?: string)
→ Returns matching function names with brief descriptions
```

### Category Listing

```
list_categories()
→ Returns all available categories

list_functions(category: string)
→ Returns all functions in a category with signatures
```

### Function Details

```
describe_function(name: string)
→ Returns full documentation, parameters, return type, examples
```

---

## Architecture Considerations

### Namespace Organization

```
/strings
/case
/manipulation
/validation
/dates
/parsing
/formatting
/arithmetic
/data
/arrays
/objects
/conversion
/encoding
/math
```

### Response Format

All functions return a consistent response structure:

```json
{
  "success": true,
  "result": "<output>",
  "inputType": "string",
  "outputType": "string"
}
```

Or on error:

```json
{
  "success": false,
  "error": "Invalid input: expected string, received number",
  "errorCode": "TYPE_ERROR"
}
```

### Performance

- Functions should execute in <10ms
- No external dependencies or network calls
- Stateless operations only

---

## Integration with Code Execution Pattern

Following Anthropic’s code execution approach, this server can be exposed as a code API:

```typescript
// Agent-written code using the utility server
import * as strings from "./servers/utilities/strings";
import * as dates from "./servers/utilities/dates";

const slug = await strings.toKebabCase({ input: userTitle });
const formatted = await dates.formatDate({
  isoDate: createdAt,
  format: "MMMM D, YYYY",
});
```

This allows agents to compose multiple utility calls efficiently without round-tripping through the context window.

---

## Open Questions

1. **Scope boundaries** — Where does “utility” end and “business logic” begin?
1. **Versioning** — How to handle function behavior changes over time?
1. **Localization** — Should locale-aware functions be separate or parameterized?
1. **Error handling** — Strict type checking vs. graceful coercion?
1. **Extensibility** — Can users add custom functions to the server?

---

## Next Steps

- [ ] Define initial function set (MVP scope)
- [ ] Design detailed API schema
- [ ] Implement discovery/search mechanism
- [ ] Build prototype with core string functions
- [ ] Test with Claude Agent SDK integration
- [ ] Benchmark token savings vs. agent-implemented operations
