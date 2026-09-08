# Adding a Function

Everything for a function lives in one place: `src/functions/<category>.ts`. Adding one is a definition plus tests.

## 1. Implement and define

```ts
// src/functions/strings.ts

/** Reverse a string by code point so surrogate pairs stay intact. */
export function reverse(input: string): string {
  return Array.from(input).reverse().join("");
}

export const functions = [
  // ...existing definitions...
  defineFunction({
    name: "strings/reverse",
    description: "Reverse text character by character (Unicode code points, so emoji survive).",
    input: z.object({ input: z.string().describe("Text to reverse") }),
    returns: "reversed string",
    tags: ["string", "reverse"],
    examples: [{ description: "Emoji safe", input: { input: "ab😀" }, output: "😀ba" }],
    run: (a) => reverse(a.input),
  }),
];
```

Rules the registry test enforces:
- `name` is `category/name` or `category/sub/name`; the category must be in `CATEGORIES` in [src/core/registry.ts](../src/core/registry.ts).
- Description longer than 20 characters; every field has `.describe()`; at least two tags; a non-empty `returns`; at least one example.
- **Every example reproduces exactly** through `execute()`.

Rejecting input: throw instead of returning an envelope.

```ts
import { fail } from "../core/responses.js";

export function clamp(value: number, min: number, max: number): number {
  if (min > max) fail("INVALID_RANGE", `min (${min}) cannot be greater than max (${max})`);
  return Math.min(Math.max(value, min), max);
}
```

Prefer Zod constraints (`.int()`, `.min()`, `.max()`, `.enum()`) over manual checks; they produce `INVALID_INPUT` with per-field issues on both surfaces.

Put the primary input first in the schema: the CLI binds stdin and the first positional to it, and `pipe` feeds it.

## 2. Test

```ts
// tests/unit/functions/strings.test.ts
import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import { functions, reverse } from "../../../src/functions/strings.js";

describe("reverse", () => {
  it("reverses by code point", () => {
    expect(reverse("ab😀")).toBe("😀ba");
    expect(reverse("")).toBe("");
  });
  it("rejects a missing input through the envelope", () => {
    const fn = functions.find((f) => f.name === "strings/reverse")!;
    expect(execute(fn, {})).toMatchObject({ success: false, errorCode: "INVALID_INPUT" });
  });
});
```

Run `npm test`. Both surfaces pick the function up automatically; check with:

```bash
npx tsx src/index.ts strings/reverse "ab😀"
npx tsx src/index.ts strings/reverse --help
```

## 3. New category

1. Create `src/functions/<category>.ts` exporting `functions`.
2. Import it in [src/core/registry.ts](../src/core/registry.ts), spread it into the `functions` list, and add a one-line `CATEGORIES` description.
3. Add `tests/unit/functions/<category>.test.ts`.

## Determinism checklist

- No filesystem, network, clock (`Date.now`, `new Date()` without an argument), or randomness.
- No host locale or timezone: dates use `UTCDate` / `TZDate`; string case uses `toLowerCase()` not `toLocaleLowerCase()`.
- Object keys from input may be `__proto__`: write with `setOwn()` from `functions/data.ts` or `Object.defineProperty`.
- Stable ordering when sorting or grouping (see `compareValues` in `functions/data.ts`).
- Under 10 ms.
