/**
 * Tests for the CLI adapter. Invokes runCli() directly and captures
 * writes to process.stdout / process.stderr via spies.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { runCli } from "../../src/cli.js";

interface Captured {
  stdout: string;
  stderr: string;
  exit: number;
}

async function run(argv: string[], stdin?: string): Promise<Captured> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    });

  const originalStdin = process.stdin;
  if (stdin !== undefined) {
    const fake = Readable.from([stdin]) as unknown as NodeJS.ReadStream;
    (fake as unknown as { isTTY: boolean }).isTTY = false;
    Object.defineProperty(process, "stdin", { value: fake, configurable: true });
  } else {
    Object.defineProperty(process, "stdin", {
      value: Object.assign(originalStdin, { isTTY: true }),
      configurable: true,
    });
  }

  try {
    const exit = await runCli(argv);
    return { stdout: stdoutChunks.join(""), stderr: stderrChunks.join(""), exit };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    Object.defineProperty(process, "stdin", { value: originalStdin, configurable: true });
  }
}

beforeEach(() => {
  // ensure each test sees a non-TTY-free default unless stdin passed
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI — utility invocation", () => {
  it("binds positional arg to first field", async () => {
    const r = await run(["strings/toCamelCase", "hello world"]);
    expect(r.stdout.trim()).toBe("helloWorld");
    expect(r.exit).toBe(0);
  });

  it("binds flag to named field", async () => {
    const r = await run(["strings/toCamelCase", "--input", "hello world"]);
    expect(r.stdout.trim()).toBe("helloWorld");
    expect(r.exit).toBe(0);
  });

  it("reads first required field from stdin when piped", async () => {
    const r = await run(["strings/toCamelCase"], "hello world");
    expect(r.stdout.trim()).toBe("helloWorld");
    expect(r.exit).toBe(0);
  });

  it("assigns multiple positionals to unfilled fields in declaration order", async () => {
    const r = await run(["strings/truncate", "Hello World", "8"]);
    expect(r.stdout.trim()).toBe("Hello...");
    expect(r.exit).toBe(0);
  });

  it("mixes positional and flags", async () => {
    const r = await run(["math/clamp", "100", "--min", "0", "--max", "50"]);
    expect(r.stdout.trim()).toBe("50");
    expect(r.exit).toBe(0);
  });

  it("translates kebab-case flags to camelCase fields", async () => {
    const r = await run([
      "dates/addDays",
      "--iso-date",
      "2026-05-08T00:00:00Z",
      "--days",
      "7",
    ]);
    expect(r.stdout.trim()).toBe("2026-05-15T00:00:00.000Z");
    expect(r.exit).toBe(0);
  });

  it("parses JSON from flag values for array inputs", async () => {
    const r = await run(["data/arrays/unique", "--array", "[1,2,2,3]"]);
    expect(JSON.parse(r.stdout)).toEqual([1, 2, 3]);
    expect(r.exit).toBe(0);
  });

  it("parses JSON from stdin for complex inputs", async () => {
    const r = await run(["data/arrays/unique"], "[1,2,2,3]");
    expect(JSON.parse(r.stdout)).toEqual([1, 2, 3]);
    expect(r.exit).toBe(0);
  });

  it("passes raw CSV string from stdin to csvToJson", async () => {
    const r = await run(["conversion/csvToJson"], "name,age\nAlice,30\n");
    expect(JSON.parse(r.stdout)).toEqual([{ name: "Alice", age: "30" }]);
    expect(r.exit).toBe(0);
  });
});

describe("CLI — output formatting", () => {
  it("emits raw scalar on stdout by default", async () => {
    const r = await run(["validation/isEmail", "a@b.com"]);
    expect(r.stdout.trim()).toBe("true");
    expect(r.stderr).toBe("");
    expect(r.exit).toBe(0);
  });

  it("--json emits the full envelope", async () => {
    const r = await run(["strings/toCamelCase", "hello", "--json"]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.result).toBe("hello");
    expect(parsed.metadata).toBeDefined();
    expect(r.exit).toBe(0);
  });

  it("--raw emits arrays one element per line", async () => {
    const r = await run(["data/arrays/unique", "[1,2,2,3]", "--raw"]);
    expect(r.stdout).toBe("1\n2\n3\n");
    expect(r.exit).toBe(0);
  });

  it("--raw emits objects as key=value lines", async () => {
    const r = await run(["strings/wordCount", "hello world", "--raw"]);
    expect(r.stdout).toBe("words=2\nchars=11\nlines=1\n");
    expect(r.exit).toBe(0);
  });

  it("--raw is a no-op for scalar results", async () => {
    const r = await run(["strings/toCamelCase", "hello world", "--raw"]);
    expect(r.stdout.trim()).toBe("helloWorld");
    expect(r.exit).toBe(0);
  });

  it("--quiet suppresses stdout and exits 0 for true boolean", async () => {
    const r = await run(["validation/isEmail", "a@b.com", "--quiet"]);
    expect(r.stdout).toBe("");
    expect(r.exit).toBe(0);
  });

  it("--quiet exits 1 for false boolean", async () => {
    const r = await run(["validation/isEmail", "nope", "-q"]);
    expect(r.stdout).toBe("");
    expect(r.exit).toBe(1);
  });

  it("--quiet suppresses stdout but exits 0 for non-boolean success", async () => {
    const r = await run(["strings/toCamelCase", "hello", "-q"]);
    expect(r.stdout).toBe("");
    expect(r.exit).toBe(0);
  });

  it("--quiet preserves exit 2 for execution errors", async () => {
    const r = await run(["dates/parseDate", "not a date", "-q"]);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/error:/);
    expect(r.exit).toBe(2);
  });
});

describe("CLI — error paths", () => {
  it("utility execution error → stderr + exit 2", async () => {
    const r = await run(["dates/parseDate", "not a date"]);
    expect(r.stderr).toMatch(/error:/);
    expect(r.stdout).toBe("");
    expect(r.exit).toBe(2);
  });

  it("unknown command → suggestions + exit 1", async () => {
    const r = await run(["strings/notARealThing", "x"]);
    expect(r.stderr).toMatch(/Unknown command/);
    expect(r.exit).toBe(1);
  });

  it("unknown flag → exit 1 and enumerates valid flags", async () => {
    const r = await run(["strings/toCamelCase", "--bogus", "x"]);
    expect(r.stderr).toMatch(/Unknown flag/);
    expect(r.stderr).toMatch(/--input/);
    expect(r.exit).toBe(1);
  });

  it("--json on error still emits envelope and exits 2", async () => {
    const r = await run(["dates/parseDate", "not a date", "--json"]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
    expect(r.exit).toBe(2);
  });
});

describe("CLI — discovery", () => {
  it("list shows categories", async () => {
    const r = await run(["list"]);
    expect(r.stdout).toMatch(/Categories:/);
    expect(r.stdout).toMatch(/strings/);
    expect(r.exit).toBe(0);
  });

  it("list <category> shows functions", async () => {
    const r = await run(["list", "strings"]);
    expect(r.stdout).toMatch(/strings\/toCamelCase/);
    expect(r.exit).toBe(0);
  });

  it("search finds matching functions", async () => {
    const r = await run(["search", "email"]);
    expect(r.stdout).toMatch(/validation\/isEmail/);
    expect(r.exit).toBe(0);
  });

  it("describe returns JSON metadata", async () => {
    const r = await run(["describe", "strings/toCamelCase"]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.name).toBe("strings/toCamelCase");
    expect(parsed.parameters).toBeInstanceOf(Array);
    expect(r.exit).toBe(0);
  });

  it("--help prints usage", async () => {
    const r = await run(["--help"]);
    expect(r.stdout).toMatch(/monolith/);
    expect(r.stdout).toMatch(/Usage:/);
    expect(r.exit).toBe(0);
  });

  it("<fn> --help prints function help", async () => {
    const r = await run(["strings/truncate", "--help"]);
    expect(r.stdout).toMatch(/strings\/truncate/);
    expect(r.stdout).toMatch(/--length/);
    expect(r.exit).toBe(0);
  });
});
