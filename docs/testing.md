# Testing

```
tests/unit/
├── registry.test.ts     # contract for every function (names, metadata, example sweep)
├── server.test.ts       # MCP adapter via a real client over InMemoryTransport
├── cli.test.ts          # runCli() with stdout/stderr captured and stdin faked
└── functions/           # one suite per category, testing raw functions + error envelopes
```

```bash
npm test                                   # everything, once
npm run test:watch
npx vitest --run tests/unit/functions/dates.test.ts
TZ=Asia/Tokyo npm test                     # results must not change
```

## Patterns

**Raw functions** are exported from each module, so most tests call them directly:

```ts
expect(round(1.005, 2)).toBe(1.01);
expect(() => clamp(1, 5, 1)).toThrow(UtilityError);
```

**Envelopes** go through `execute()`; use it for at least one error path per fallible function:

```ts
const fn = functions.find((f) => f.name === "math/clamp")!;
expect(execute(fn, { value: 1, min: 5, max: 1 })).toMatchObject({ success: false, errorCode: "INVALID_RANGE" });
expect(execute(fn, { value: "x" })).toMatchObject({ success: false, errorCode: "INVALID_INPUT" });
```

**Examples** in `defineFunction` are executed by `tests/unit/registry.test.ts`. A wrong example fails the build, so examples double as documentation and regression tests.

**Timezone independence:** `tests/unit/functions/dates.test.ts` sets `process.env.TZ` before importing anything and asserts UTC results; CI-style runs under other zones must produce the same output.

**Adapters:** `server.test.ts` connects a real `Client` to `createServer()` and checks tool listing, annotations, `structuredContent`, `isError`, both tool modes, `batch`, and `pipe`. `cli.test.ts` drives `runCli()` and asserts stdout, stderr, exit codes, and the JSON error envelopes with their `next` steps.
