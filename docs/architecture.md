# Architecture

## One definition, many surfaces

Every function is declared once with `defineFunction()` ([src/core/define.ts](../src/core/define.ts)):

```ts
defineFunction({
  name: "math/clamp",
  description: "Constrain a number to the inclusive range [min, max].",
  input: z.object({ value: ..., min: ..., max: ... }),
  returns: "value limited to the range",
  tags: ["math", "clamp", "limit"],
  examples: [{ description: "Above max", input: { value: 100, min: 0, max: 50 }, output: 50 }],
  run: (a) => clamp(a.value, a.min, a.max),
});
```

Everything else is derived from that object:

| Consumer | Derives |
|---|---|
| `execute()` | Validation (Zod `safeParse`), invocation, envelope |
| Registry ([src/core/registry.ts](../src/core/registry.ts)) | Lookup by name, MCP tool name, category list, keyword search, "did you mean" suggestions, `FunctionMetadata` (parameters from the JSON Schema projection) |
| MCP adapter ([src/server.ts](../src/server.ts)) | Tool list (`inputSchema`, `title`, annotations), `describe_function` payloads |
| CLI adapter ([src/cli.ts](../src/cli.ts)) | Flags (kebab-cased field names), positional order, stdin target, `--help` text, recovery-step commands, `schema` output |
| Tests ([tests/unit/registry.test.ts](../tests/unit/registry.test.ts)) | The example sweep: every example must reproduce exactly |

## Execution path

```
raw args ─► fn.input.safeParse ─► fn.run(parsed) ─► { success: true, result }
                 │                       │
                 └─ ZodError             └─ UtilityError(code) ─► { success: false, errorCode: code, error }
                    ─► INVALID_INPUT + issues[]      other throw ─► EXECUTION_ERROR
```

`execute()` is the only way either surface invokes a function. Implementations never see envelopes: they return a value or throw `fail(code, message, details?)` ([src/core/responses.ts](../src/core/responses.ts)).

## Registry

[src/core/registry.ts](../src/core/registry.ts) imports each `src/functions/<category>.ts` module's `functions` array and concatenates them into one frozen list. There is no registration call and no mutable state. `CATEGORIES` holds the human descriptions shown by `list_categories`; adding a category means one import and one description.

`toToolName()` maps `strings/toCamelCase` to `strings_toCamelCase` because MCP tool names should not contain `/`. `getFunction()` accepts either form.

## MCP adapter

- `tools/list` is computed once at startup and returned in a stable order (good for client prompt caches).
- Every tool carries `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }` and a `title`.
- `tools/call` returns the envelope as both a text block and `structuredContent`; `isError` is set whenever `success` is false.
- Discovery tools (`search_functions`, `list_categories`, `describe_function`) validate their arguments through the same `validationErrorResponse`.
- Composition tools `batch` and `pipe` ([src/core/compose.ts](../src/core/compose.ts)) run several functions per request.
- `MONOLITH_TOOL_MODE=compact` replaces the per-function tools with a single `run` tool for clients that load every schema up front.
- The `initialize` response carries `instructions` that tell the model what the server is for.

## CLI adapter

1. `parseArgv` separates output options (`--json`, `--raw`, `-q`, `--help`, `--version`), field options (`--kebab-name value`, `--kebab-name=value`, bare `--option` or `--no-option` for booleans), a `--` terminator, the command, and positionals.
2. `buildArgs` merges, in order: `--args` JSON object, options, piped stdin (into the first required field not yet set), positionals (into the remaining fields in declaration order). String fields are taken verbatim; other fields are JSON-parsed.
3. `execute()` runs the function. `INVALID_INPUT` is reworded in terms of options and gets `next` steps built from the schema; validation and usage errors exit 2, function errors exit 1 with a help step.
4. Output follows the `--json` / `--raw` / `--quiet` rules; `index.ts` sets `process.exitCode` so large piped output is flushed.

Subcommands `list`, `search`, `describe`, `schema`, `pipe`, `batch`, and `help` all read the same registry. Each declares its options and positional counts in `BUILTINS`, which drives both validation (unknown options and extra arguments exit 2 before any work) and its help text.
