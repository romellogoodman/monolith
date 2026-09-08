/**
 * CLI adapter tests: runCli() with stdout/stderr captured and stdin faked.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { parseArgv, runCli } from "../../src/cli.js";
import { functions } from "../../src/core/registry.js";

interface Captured {
  stdout: string;
  stderr: string;
  exit: number;
  json: () => Record<string, unknown>;
}

const realStdin = process.stdin;

async function run(argv: string[], stdin?: string): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  const toStr = (c: string | Uint8Array) => (typeof c === "string" ? c : Buffer.from(c).toString());
  vi.spyOn(process.stdout, "write").mockImplementation(
    (c: string | Uint8Array) => (out.push(toStr(c)), true)
  );
  vi.spyOn(process.stderr, "write").mockImplementation(
    (c: string | Uint8Array) => (err.push(toStr(c)), true)
  );
  const fake =
    stdin === undefined
      ? Object.assign(new Readable({ read() {} }), { isTTY: true })
      : Object.assign(Readable.from([stdin]), { isTTY: false });
  Object.defineProperty(process, "stdin", { value: fake, configurable: true });
  try {
    const exit = await runCli(argv);
    const stdout = out.join("");
    return { stdout, stderr: err.join(""), exit, json: () => JSON.parse(stdout) };
  } finally {
    Object.defineProperty(process, "stdin", { value: realStdin, configurable: true });
  }
}

afterEach(() => vi.restoreAllMocks());

describe("argv parsing", () => {
  it("recognizes output flags, --flag=value, and -- terminator", () => {
    const p = parseArgv([
      "strings/slugify",
      "--json",
      "-q",
      "--input=--weird",
      "--",
      "--not-a-flag",
    ]);
    expect(p).toMatchObject({
      command: "strings/slugify",
      json: true,
      quiet: true,
      flags: { input: "--weird" },
      positionals: ["--not-a-flag"],
    });
  });

  it("takes negative numbers as flag values and marks bare flags", () => {
    const p = parseArgv(["dates/addDays", "--days", "-7", "--iso-date", "--json"]);
    expect(p.flags).toEqual({ days: "-7", isoDate: true });
    expect(p.json).toBe(true);
  });
});

describe("function invocation", () => {
  it("binds positional to the first field", async () => {
    const r = await run(["strings/toCamelCase", "hello world"]);
    expect(r).toMatchObject({ stdout: "helloWorld\n", exit: 0 });
  });

  it("binds --flags with kebab-case names", async () => {
    const r = await run(["dates/addDays", "--iso-date", "2026-01-01", "--days", "-1"]);
    expect(r.stdout.trim()).toBe("2025-12-31T00:00:00.000Z");
  });

  it("reads the first required field from piped stdin, positionals fill the rest", async () => {
    expect((await run(["strings/toCamelCase"], "hello world\n")).stdout.trim()).toBe("helloWorld");
    const r = await run(["strings/truncate", "5"], "Hello World");
    expect(r).toMatchObject({ stdout: "He...\n", exit: 0 });
  });

  it("rejects a positional when stdin already filled the only field", async () => {
    const r = await run(["strings/toCamelCase", "given", "--json"], "piped");
    expect(r.exit).toBe(1);
    expect(r.json().errorCode).toBe("TOO_MANY_ARGUMENTS");
  });

  it("does not JSON-coerce string fields but does coerce others", async () => {
    expect((await run(["strings/slugify", "2024"])).stdout.trim()).toBe("2024");
    expect((await run(["data/arrays/unique", "[1,1,2]", "--raw"])).stdout).toBe("1\n2\n");
  });

  it("accepts a full argument object via --args", async () => {
    const r = await run(["math/clamp", "--args", '{"value": 9, "min": 0, "max": 5}']);
    expect(r.stdout.trim()).toBe("5");
    const bad = await run(["math/clamp", "--args", "nope", "--json"]);
    expect(bad.json().errorCode).toBe("INVALID_ARGS_JSON");
  });

  it("accepts values starting with -- via = or --", async () => {
    expect((await run(["strings/slugify", "--input=--weird"])).stdout.trim()).toBe("weird");
    expect((await run(["strings/slugify", "--", "--weird"])).stdout.trim()).toBe("weird");
  });

  it("errors when a non-boolean flag has no value", async () => {
    const r = await run(["strings/slugify", "--input", "--json"]);
    expect(r.exit).toBe(1);
    expect(r.json()).toMatchObject({ errorCode: "MISSING_VALUE" });
  });

  it("emits the full envelope with --json", async () => {
    const r = await run(["strings/wordCount", "a b", "--json"]);
    expect(r.json()).toEqual({ success: true, result: { words: 2, chars: 3, lines: 1 } });
  });

  it("renders objects as key=value lines with --raw", async () => {
    const r = await run(["strings/wordCount", "a b", "--raw"]);
    expect(r.stdout).toBe("words=2\nchars=3\nlines=1\n");
  });

  it("drives the exit code from booleans under --quiet, with or without --json", async () => {
    expect(await run(["validation/isEmail", "x@y.com", "-q"])).toMatchObject({
      stdout: "",
      exit: 0,
    });
    expect(await run(["validation/isEmail", "nope", "-q"])).toMatchObject({ stdout: "", exit: 1 });
    expect(await run(["validation/isEmail", "nope", "-q", "--json"])).toMatchObject({
      stdout: "",
      exit: 1,
    });
  });
});

describe("errors", () => {
  it("names missing flags and offers a runnable command", async () => {
    const r = await run(["strings/truncate", "hello", "--json"]);
    const e = r.json() as {
      errorCode: string;
      error: string;
      issues: unknown[];
      next: Array<{ command: string }>;
    };
    expect(r.exit).toBe(1);
    expect(e.errorCode).toBe("INVALID_INPUT");
    expect(e.error).toContain("requires --length");
    expect(e.issues.length).toBeGreaterThan(0);
    expect(e.next[0].command).toBe("monolith strings/truncate --input hello --length <length>");
  });

  it("prints prose errors to stderr without --json", async () => {
    const r = await run(["strings/truncate", "hello"]);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("error: strings/truncate requires --length");
    expect(r.stderr).toContain("monolith strings/truncate --help");
  });

  it("rejects unknown flags listing the valid ones", async () => {
    const r = await run(["strings/slugify", "x", "--nope", "1", "--json"]);
    expect(r.json()).toMatchObject({ errorCode: "UNKNOWN_FLAG" });
    expect((r.json() as { error: string }).error).toContain("--input");
  });

  it("exits 2 when the function rejects the input", async () => {
    const r = await run(["math/clamp", "1", "--min", "5", "--max", "1", "--json"]);
    expect(r.exit).toBe(2);
    expect(r.json()).toMatchObject({ errorCode: "INVALID_RANGE" });
  });

  it("suggests close names for unknown functions", async () => {
    const r = await run(["strings/slugfy", "x", "--json"]);
    expect(r.exit).toBe(1);
    const e = r.json() as { errorCode: string; error: string; next: Array<{ command: string }> };
    expect(e.errorCode).toBe("UNKNOWN_FUNCTION");
    expect(e.error).toContain("strings/slugify");
    expect(e.next[0].command).toBe("monolith strings/slugify --help");
  });
});

describe("discovery commands", () => {
  it("--version and --help", async () => {
    expect((await run(["--version"])).stdout).toMatch(/^monolith \d+\.\d+\.\d+\n$/);
    expect((await run(["-v"])).stdout).toMatch(/^monolith /);
    expect((await run(["--help"])).stdout).toContain("Usage:");
    expect((await run([])).stdout).toContain("Usage:");
  });

  it("list shows categories and functions, as prose or JSON", async () => {
    const cats = await run(["list"]);
    expect(cats.stdout).toContain("strings");
    const json = (await run(["list", "--json"])).json() as {
      result: { categories: Array<{ count: number }> };
    };
    expect(json.result.categories.reduce((n, c) => n + c.count, 0)).toBe(functions.length);
    const fns = await run(["list", "strings", "--json"]);
    expect(
      (fns.json() as { result: { functions: unknown[] } }).result.functions.length
    ).toBeGreaterThan(5);
    const bad = await run(["list", "nope", "--json"]);
    expect(bad.json()).toMatchObject({ errorCode: "UNKNOWN_CATEGORY" });
  });

  it("search finds by keyword with optional category", async () => {
    expect((await run(["search", "hash"])).stdout).toContain("encoding/hashSha256");
    const r = (await run(["search", "hash", "--category", "strings", "--json"])).json() as {
      result: { count: number };
    };
    expect(r.result.count).toBe(0);
    expect((await run(["search", "--json"])).json()).toMatchObject({
      errorCode: "MISSING_ARGUMENT",
    });
  });

  it("describe and schema emit JSON", async () => {
    const d = (await run(["describe", "strings/truncate"])).json() as {
      parameters: Array<{ name: string }>;
    };
    expect(d.parameters.map((p) => p.name)).toEqual(["input", "length", "suffix"]);
    const s = (await run(["schema", "strings/truncate"])).json() as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(s.properties)).toEqual(["input", "length", "suffix"]);
    const all = (await run(["schema"])).json();
    expect(Object.keys(all).length).toBe(functions.length);
  });

  it("function --help shows parameters and shell-safe examples", async () => {
    const r = await run(["data/arrays/sortBy", "--help"]);
    expect(r.stdout).toContain("--array");
    expect(r.stdout).toContain("--direction");
    expect(r.stdout).toContain('(default: "asc")');
    expect(r.stdout).toContain('--array \'[{"age":30},{"age":25}]\' --key age');
  });
});

describe("composition", () => {
  it("pipe chains functions over stdin", async () => {
    const r = await run(["pipe", "strings/slugify", "encoding/base64Encode"], "My Post");
    expect(r.stdout.trim()).toBe(Buffer.from("my-post").toString("base64"));
    const bad = await run(["pipe", "strings/slugify", "math/round", "--json"], "x");
    expect(bad.exit).toBe(2);
    expect(bad.json()).toMatchObject({ errorCode: "INVALID_INPUT" });
    expect((await run(["pipe", "strings/nope", "--json"], "x")).json()).toMatchObject({
      errorCode: "UNKNOWN_FUNCTION",
    });
  });

  it("batch reads JSONL and writes one envelope per line", async () => {
    const lines = [
      '{"name":"strings/slugify","args":{"input":"A B"}}',
      '{"name":"math/clamp","args":{"value":1,"min":5,"max":1}}',
    ].join("\n");
    const r = await run(["batch"], lines);
    const out = r.stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(out[0]).toEqual({ name: "strings/slugify", success: true, result: "a-b" });
    expect(out[1]).toMatchObject({
      name: "math/clamp",
      success: false,
      errorCode: "INVALID_RANGE",
    });
    expect(r.exit).toBe(2);
    expect((await run(["batch", "--json"], "not json")).json()).toMatchObject({
      errorCode: "INVALID_ARGS_JSON",
    });
  });
});
