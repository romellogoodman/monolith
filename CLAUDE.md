# Monolith - Deterministic Utility Library for Agents

## What

123 deterministic utility functions across 13 categories, exposed through **two surfaces that share one registry**: an MCP stdio server and a POSIX-style CLI. Same binary. Dispatch: argv present → CLI; argv empty + piped stdin → MCP stdio; argv empty + TTY stdin → CLI help.

**Tech Stack:** TypeScript (strict, ESM), Node.js ≥22.2, `@modelcontextprotocol/sdk`, Zod 4, Vitest, ESLint (flat config), Prettier.

**Project Structure:**
```
src/
├── index.ts          # Entry — dispatches MCP vs CLI on argv; sets process.exitCode (never process.exit)
├── server.ts         # MCP adapter (full/compact tool modes, batch, pipe)
├── cli.ts            # CLI adapter
├── core/
│   ├── define.ts     # defineFunction() + execute(): the ONLY invocation path
│   ├── responses.ts  # UtilityResponse envelope, UtilityError, fail(), ErrorCode
│   ├── registry.ts   # Derived from function modules: lookup, search, categories, metadata, VERSION
│   └── compose.ts    # batch and pipe over the registry
└── functions/        # ONE file per category; schema + implementation + examples co-located
    strings.ts validation.ts conversion.ts dates.ts math.ts data.ts encoding.ts
    json.ts semver.ts paths.ts urls.ts regex.ts color.ts
tests/unit/
├── registry.test.ts  # Contract: unique names, MCP-safe names, every example reproduces
├── server.test.ts    # Real MCP client over in-memory transport
├── cli.test.ts       # runCli() with captured stdio
└── functions/        # One suite per category
```

## Why

**Core principle:** trade agent flexibility for deterministic reliability on well-defined operations.

Agents call tested functions instead of regenerating them. One `defineFunction` call per function drives both surfaces, the help text, the JSON Schema, and discovery, so nothing can drift. Examples in the definition are executed by the test suite. The CLI makes the library usable from shell-first agent harnesses that don't configure MCP.

## How

### Commands
```bash
npm run dev          # Hot reload
npm test             # Vitest, single run (test:watch for watch mode)
npm run typecheck    # tsc --noEmit over src AND tests
npm run lint         # eslint (flat config in eslint.config.js)
npm run check        # typecheck + lint + format:check + test — run before committing
npm run build        # tsc -p tsconfig.build.json → dist/
```

### Adding a function
Full walkthrough: [docs/adding_functions.md](docs/adding_functions.md).

Quick path:
1. In `src/functions/<category>.ts`, export the raw implementation and append a `defineFunction({ name, description, input, returns, tags, examples, run })` to the module's `functions` array.
2. Add tests in `tests/unit/functions/<category>.test.ts`. The registry test already verifies your examples.
3. New category: create the module, import it in `src/core/registry.ts`, and add a `CATEGORIES` description.

### Conventions
- **Implementations return values.** `run` returns the result or throws `fail(code, message, details?)` (a `UtilityError`). Never build envelopes, never wrap in try/catch for expected failures. `execute()` in `core/define.ts` produces `{ success: true, result }` or `{ success: false, error, errorCode, issues?, details? }` for both surfaces.
- **Naming:** `category/functionName` (or `category/sub/functionName`). MCP tool names replace `/` with `_`; `getFunction` accepts both.
- **Primary field first.** The first field in the input schema is what the CLI binds from stdin and the first positional, and what `pipe` feeds.
- **Examples must reproduce exactly** (`tests/unit/registry.test.ts` sweeps them). Every function needs ≥1 example, ≥2 tags, a `returns` string, and a description over 20 characters with every parameter described.
- **Determinism:** no I/O, network, clock, randomness, or host locale/timezone. Dates are UTC (`UTCDate`/`TZDate` from `@date-fns/utc` and `@date-fns/tz`); never `new Date(y, m, d)`.
- **JSON safety:** use `setOwn`/`canonicalJson` helpers from `functions/data.ts` when writing keys that may be `__proto__`; Zod's `z.record` drops that key before `run`, so the guarantee lives in the raw functions.
- **Performance:** target <10ms.
- **CLI output rules:** scalars raw on stdout; objects/arrays as JSON; `--json` opts into the envelope; `--raw` for line-oriented output; `-q`/`--quiet` silences stdout and drives exit code from booleans; exit `0`/`1` (usage or validation, or `--quiet` false)/`2` (function error). Binding order: `--args` JSON, flags, stdin (first required field), positionals.
- **Errors carry their recovery:** every CLI error is an `ErrorResponse` with `errorCode` and `next: [{command, when}]` (`<field>` marks a placeholder). Prose goes to stderr; with `--json` the envelope goes to stdout. Schema failures on both surfaces go through `validationErrorResponse` so MCP and CLI emit the identical `INVALID_INPUT` + `issues` shape.
- **MCP:** every tool is annotated read-only/idempotent/closed-world; results include `structuredContent`; `MONOLITH_TOOL_MODE=compact` exposes discovery + `run` + `batch` + `pipe` only. Tool descriptions stay short (the list is what costs context); examples live behind `describe_function`.

## Subprojects

- `website/` — landing page (Vite + React + p5.js, see [website/CLAUDE.md](website/CLAUDE.md)). Separate npm project.

## Additional Documentation

- [Architecture](docs/architecture.md) — define/execute, registry derivation, adapters, data flow
- [Adding Functions](docs/adding_functions.md) — complete walkthrough
- [Testing](docs/testing.md) — unit + adapter patterns
- [MCP Integration](docs/mcp_integration.md) — configuring clients, tool modes
