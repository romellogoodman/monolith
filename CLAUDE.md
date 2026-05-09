# Monolith - Deterministic Utility Library for Agents

## What

17+ deterministic utility functions exposed through **two surfaces that share one dispatch table**: an MCP stdio server and a POSIX-style CLI. Same binary. Dispatch: argv present → CLI; argv empty + piped stdin → MCP stdio (MCP clients pipe JSON-RPC); argv empty + TTY stdin → CLI help.

**Tech Stack:** TypeScript (strict, ESM), Node.js, `@modelcontextprotocol/sdk`, Zod, Vitest.

**Project Structure:**
```
src/
├── index.ts              # Entry — dispatches MCP vs CLI on argv
├── server.ts             # MCP adapter (consumes dispatch table)
├── cli.ts                # CLI adapter (consumes dispatch table)
├── registry/
│   ├── dispatch.ts       # Shared name → {schema, execute} — ONE SOURCE
│   ├── functions.ts      # Discoverable metadata
│   └── index.ts          # Registry query API
├── discovery/            # search / list / describe handlers
├── schemas/              # Zod validation schemas (one file per category)
├── types/                # Shared types + UtilityResponse helpers
└── utils/                # Function implementations
    └── strings/ validation/ conversion/ dates/ math/ data/ encoding/
```

## Why

**Core principle:** trade agent flexibility for deterministic reliability on well-defined operations.

Agents call tested functions instead of regenerating them. One dispatch table drives both MCP and CLI, so the two surfaces can't drift — add a function in one place, both expose it. The CLI makes the library usable from shell-first agent harnesses that don't configure MCP.

## How

### Commands
```bash
npm run dev          # Hot reload
npm test             # Vitest suite
npm run typecheck    # tsc --noEmit
npm run build        # Compile to dist/
```

### Adding a function
Full walkthrough: [docs/adding_functions.md](docs/adding_functions.md).

Quick path:
1. Implement in `src/utils/[category]/` returning `UtilityResponse<T>`
2. Zod schema in `src/schemas/[category].ts`
3. Metadata in `src/registry/functions.ts`
4. **One entry** in `src/registry/dispatch.ts` — both MCP and CLI pick it up
5. Tests in `tests/unit/utils/` (and `tests/unit/cli.test.ts` if new arg shapes)

### Conventions
- **Response envelope:** all utilities return `UtilityResponse<T>` — use `successResponse(result, metadata?)` / `errorResponse(error, code)` from [src/types/responses.ts](src/types/responses.ts).
- **Naming:** `category/functionName` (e.g., `strings/toCamelCase`).
- **Performance:** target <10ms. No I/O, network, or external state.
- **CLI output rules:** scalars raw on stdout; objects/arrays as JSON; `--json` opts into full envelope; errors on stderr; exit `0`/`1` (usage)/`2` (execution).

## Additional Documentation

- [Architecture](docs/architecture.md) — dispatch table, registry, data flow
- [Adding Functions](docs/adding_functions.md) — complete walkthrough
- [Testing](docs/testing.md) — unit + integration patterns
- [MCP Integration](docs/mcp_integration.md) — configuring clients
