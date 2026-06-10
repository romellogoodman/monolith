/**
 * CLI adapter over the shared dispatch table.
 *
 * Usage:
 *   monolith <category/function> [args...] [--flags] [--json]
 *   monolith list [category]
 *   monolith search <query>
 *   monolith describe <name>
 *   monolith --help
 *   monolith --version
 */

import { registerAllFunctions } from "./registry/functions.js";
import {
  dispatchEntries,
  getDispatchEntry,
  type DispatchEntry,
} from "./registry/dispatch.js";
import {
  getAllFunctions,
  getCategories,
  getFunction,
  searchFunctions,
} from "./registry/index.js";
import type { UtilityResponse } from "./types/index.js";

const VERSION = "1.0.0";

interface ParsedArgv {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
  json: boolean;
  raw: boolean;
  quiet: boolean;
  help: boolean;
}

function parseArgv(argv: string[]): ParsedArgv {
  const out: ParsedArgv = {
    command: undefined,
    positionals: [],
    flags: {},
    json: false,
    raw: false,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];

    if (tok === "--json") {
      out.json = true;
      continue;
    }
    if (tok === "--raw") {
      out.raw = true;
      continue;
    }
    if (tok === "--quiet" || tok === "-q") {
      out.quiet = true;
      continue;
    }
    if (tok === "--help" || tok === "-h") {
      out.help = true;
      continue;
    }

    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq !== -1) {
        const key = kebabToCamel(tok.slice(2, eq));
        out.flags[key] = tok.slice(eq + 1);
      } else {
        const key = kebabToCamel(tok.slice(2));
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          out.flags[key] = next;
          i++;
        } else {
          out.flags[key] = true;
        }
      }
      continue;
    }

    if (out.command === undefined) {
      out.command = tok;
    } else {
      out.positionals.push(tok);
    }
  }

  return out;
}

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function coerceValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isFieldRequired(schema: DispatchEntry["schema"], key: string): boolean {
  const field = schema.shape[key];
  if (!field) return false;
  const probe = field.safeParse(undefined);
  return !probe.success;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer | string) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

async function buildArgs(entry: DispatchEntry, parsed: ParsedArgv): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {};
  const shape = entry.schema.shape;
  const fieldNames = Object.keys(shape);

  for (const [key, value] of Object.entries(parsed.flags)) {
    if (!(key in shape)) {
      throw new UsageError(
        `Unknown flag --${camelToKebab(key)} for ${entry.name}.\n` +
          `Valid flags: ${fieldNames.map((f) => "--" + camelToKebab(f)).join(", ")}`
      );
    }
    args[key] = typeof value === "string" ? coerceValue(value) : value;
  }

  const unfilled = fieldNames.filter((f) => !(f in args));
  for (let i = 0; i < parsed.positionals.length && i < unfilled.length; i++) {
    args[unfilled[i]] = coerceValue(parsed.positionals[i]);
  }

  if (parsed.positionals.length > unfilled.length) {
    throw new UsageError(
      `Too many positional arguments for ${entry.name}. ` +
        `Expected at most ${fieldNames.length} fields: ${fieldNames.join(", ")}`
    );
  }

  const firstRequired = fieldNames.find((f) => isFieldRequired(entry.schema, f));
  if (firstRequired && !(firstRequired in args) && !process.stdin.isTTY) {
    const stdin = (await readStdin()).replace(/\n$/, "");
    if (stdin.length > 0) {
      args[firstRequired] = coerceValue(stdin);
    }
  }

  return args;
}

function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

class UsageError extends Error {}

interface OutputMode {
  json: boolean;
  raw: boolean;
  quiet: boolean;
}

/** Compact, scalar-safe stringify for --raw line items. */
function rawScalar(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || v === null) return String(v);
  return JSON.stringify(v);
}

function formatResult(
  result: UtilityResponse<unknown>,
  mode: OutputMode
): {
  stdout: string | null;
  stderr: string | null;
  exit: number;
} {
  if (mode.json) {
    return {
      stdout: mode.quiet ? null : JSON.stringify(result, null, 2),
      stderr: null,
      exit: result.success ? 0 : 2,
    };
  }
  if (!result.success) {
    return { stdout: null, stderr: `error: ${result.error}`, exit: 2 };
  }

  const v = result.result;

  // --quiet: no stdout. Boolean results drive the exit code (grep -q style).
  if (mode.quiet) {
    if (typeof v === "boolean") return { stdout: null, stderr: null, exit: v ? 0 : 1 };
    return { stdout: null, stderr: null, exit: 0 };
  }

  // --raw: line-oriented output for shell pipelines.
  if (mode.raw) {
    if (Array.isArray(v)) {
      return { stdout: v.map(rawScalar).join("\n"), stderr: null, exit: 0 };
    }
    if (v !== null && typeof v === "object") {
      const lines = Object.entries(v as Record<string, unknown>).map(
        ([k, val]) => `${k}=${rawScalar(val)}`
      );
      return { stdout: lines.join("\n"), stderr: null, exit: 0 };
    }
    // scalar — same as default mode
  }

  if (typeof v === "string") return { stdout: v, stderr: null, exit: 0 };
  if (typeof v === "number" || typeof v === "boolean" || v === null) {
    return { stdout: String(v), stderr: null, exit: 0 };
  }
  return { stdout: JSON.stringify(v, null, 2), stderr: null, exit: 0 };
}

function rootHelp(): string {
  return `monolith ${VERSION} — deterministic utility CLI

Usage:
  monolith <category/function> [args...] [--flags] [--json]
  monolith list [category]
  monolith search <query>
  monolith describe <name>
  monolith --help
  monolith --version

MCP stdio mode starts automatically when stdin is piped (i.e. when an
MCP client launches the binary). To run it manually from a terminal
for debugging, redirect stdin: \`monolith < /dev/null\`.

Examples:
  monolith strings/toCamelCase "hello world"
  echo "hello world" | monolith strings/slugify
  monolith strings/truncate "Hello World" 8
  monolith math/clamp 100 --min 0 --max 50
  monolith dates/addDays --iso-date 2026-05-08T00:00:00Z --days 7
  cat config.yaml | monolith conversion/yamlToJson | jq .key
  monolith validation/isEmail "x@y.com" --quiet && echo ok
  monolith data/arrays/unique '[1,2,2,3]' --raw | while read n; do ...; done

Output flags:
  --json            Full {success, result, metadata} envelope
  --raw             Line-oriented: arrays one item/line, objects key=value/line
  -q, --quiet       No stdout; boolean results drive exit code (0=true, 1=false)

Discovery:
  monolith list                    # list all categories
  monolith list strings            # list functions in a category
  monolith search hash             # search by keyword
  monolith describe strings/slugify
`;
}

function functionHelp(entry: DispatchEntry): string {
  const meta = getFunction(entry.name);
  const shape = entry.schema.shape;
  const params = Object.entries(shape).map(([key, field]) => {
    const required = isFieldRequired(entry.schema, key);
    const paramMeta = meta?.parameters.find((p) => p.name === key);
    const desc = paramMeta?.description ?? "";
    const def = paramMeta?.default !== undefined ? ` (default: ${JSON.stringify(paramMeta.default)})` : "";
    return `  --${camelToKebab(key).padEnd(16)} ${required ? "(required) " : "           "}${desc}${def}`;
  });

  const examples = (meta?.examples ?? []).map((ex) => {
    const args = Object.entries(ex.input)
      .map(([k, v]) => `--${camelToKebab(k)} ${JSON.stringify(v)}`)
      .join(" ");
    return `  monolith ${entry.name} ${args}`;
  });

  return `${entry.name} — ${entry.description}

Parameters:
${params.join("\n")}

${examples.length > 0 ? "Examples:\n" + examples.join("\n") + "\n" : ""}Flags:
  --json            Output the full {success, result, metadata} envelope
  --raw             Line-oriented output (arrays one item/line, objects key=value/line)
  -q, --quiet       No stdout; boolean results drive exit code (0=true, 1=false)
  -h, --help        Show this help
`;
}

function listCommand(category: string | undefined): string {
  if (!category) {
    const cats = getCategories().sort((a, b) => a.name.localeCompare(b.name));
    const lines = cats.map((c) => `  ${c.name.padEnd(14)} (${c.count}) ${c.description}`);
    return `Categories:\n${lines.join("\n")}\n\nRun \`monolith list <category>\` to see its functions.`;
  }
  const fns = getAllFunctions().filter((f) => f.category === category);
  if (fns.length === 0) {
    throw new UsageError(`No functions in category '${category}'. Run 'monolith list' to see categories.`);
  }
  const lines = fns.map((f) => `  ${f.name.padEnd(30)} ${f.description}`);
  return `${category} functions:\n${lines.join("\n")}`;
}

function searchCommand(query: string): string {
  const results = searchFunctions(query);
  if (results.length === 0) return `No functions match '${query}'.`;
  const lines = results.map((f) => `  ${f.name.padEnd(30)} ${f.description}`);
  return `${results.length} match(es) for '${query}':\n${lines.join("\n")}`;
}

function describeCommand(name: string): string {
  const fn = getFunction(name);
  if (!fn) {
    throw new UsageError(`Function '${name}' not found. Run 'monolith search ${name}' to search.`);
  }
  return JSON.stringify(fn, null, 2);
}

export async function runCli(argv: string[]): Promise<number> {
  // Building the discovery registry runs `z.toJSONSchema` for every function.
  // Pure execution (e.g. `strings/toCamelCase "x"`) only needs the dispatch
  // table, so defer the registry build to the paths that actually read it.
  const parsed = parseArgv(argv);

  if (parsed.help && parsed.command === undefined) {
    process.stdout.write(rootHelp());
    return 0;
  }

  if (parsed.command === undefined || parsed.command === "--version" || parsed.command === "-v") {
    if (parsed.command === "--version" || parsed.command === "-v") {
      process.stdout.write(`monolith ${VERSION}\n`);
      return 0;
    }
    process.stdout.write(rootHelp());
    return 0;
  }

  try {
    if (parsed.command === "list") {
      registerAllFunctions();
      process.stdout.write(listCommand(parsed.positionals[0]) + "\n");
      return 0;
    }
    if (parsed.command === "search") {
      const query = parsed.positionals[0];
      if (!query) throw new UsageError("search requires a query. Usage: monolith search <query>");
      registerAllFunctions();
      process.stdout.write(searchCommand(query) + "\n");
      return 0;
    }
    if (parsed.command === "describe") {
      const name = parsed.positionals[0];
      if (!name) throw new UsageError("describe requires a function name. Usage: monolith describe <name>");
      registerAllFunctions();
      process.stdout.write(describeCommand(name) + "\n");
      return 0;
    }

    const entry = getDispatchEntry(parsed.command);
    if (!entry) {
      registerAllFunctions();
      const suggestions = searchFunctions(parsed.command).slice(0, 3).map((f) => f.name);
      const hint = suggestions.length > 0 ? `\nDid you mean: ${suggestions.join(", ")}?` : "\nRun 'monolith list' to see available functions.";
      throw new UsageError(`Unknown command: '${parsed.command}'${hint}`);
    }

    if (parsed.help) {
      registerAllFunctions();
      process.stdout.write(functionHelp(entry));
      return 0;
    }

    const args = await buildArgs(entry, parsed);
    const result = entry.execute(args);
    const out = formatResult(result, { json: parsed.json, raw: parsed.raw, quiet: parsed.quiet });
    if (out.stdout !== null) process.stdout.write(out.stdout + "\n");
    if (out.stderr !== null) process.stderr.write(out.stderr + "\n");
    return out.exit;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`error: ${error.message}\n`);
      return 1;
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (parsed.json) {
      process.stderr.write(
        JSON.stringify({ success: false, error: msg, errorCode: "CLI_ERROR" }, null, 2) + "\n"
      );
    } else {
      process.stderr.write(`error: ${msg}\n`);
    }
    return 1;
  }
}
