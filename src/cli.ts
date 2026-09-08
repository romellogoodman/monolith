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
import { z } from "zod";
import {
  validationErrorResponse,
  type ErrorResponse,
  type NextStep,
  type SuccessResponse,
  type ValidationIssue,
} from "./types/index.js";

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

// Returns true when the target field is (after unwrapping optional/default/
// nullable wrappers) a plain string. String fields must NOT be JSON-coerced —
// otherwise `slugify 2024` would pass the number 2024 instead of "2024".
function isStringField(field: unknown): boolean {
  let cur = field as { def?: { type?: string; innerType?: unknown } } | undefined;
  while (cur?.def) {
    if (cur.def.type === "string") return true;
    if (cur.def.innerType) {
      cur = cur.def.innerType as typeof cur;
    } else {
      return false;
    }
  }
  return false;
}

// Coerce a CLI string against the target Zod field: plain-string fields are
// passed through verbatim; everything else is JSON-parsed (numbers, booleans,
// arrays, objects).
function coerceForField(raw: string, field: unknown): unknown {
  return isStringField(field) ? raw : coerceValue(raw);
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
      throw new CliError({
        success: false,
        error:
          `Unknown flag --${camelToKebab(key)} for ${entry.name}. ` +
          `Valid flags: ${fieldNames.map((f) => "--" + camelToKebab(f)).join(", ")}`,
        errorCode: "UNKNOWN_FLAG",
        next: recoverySteps(entry, args),
      });
    }
    args[key] = typeof value === "string" ? coerceForField(value, shape[key]) : value;
  }

  const unfilled = fieldNames.filter((f) => !(f in args));
  for (let i = 0; i < parsed.positionals.length && i < unfilled.length; i++) {
    args[unfilled[i]] = coerceForField(parsed.positionals[i], shape[unfilled[i]]);
  }

  if (parsed.positionals.length > unfilled.length) {
    throw new CliError({
      success: false,
      error:
        `Too many positional arguments for ${entry.name}. ` +
        `Expected at most ${fieldNames.length} fields: ${fieldNames.join(", ")}`,
      errorCode: "TOO_MANY_ARGUMENTS",
      next: recoverySteps(entry, args),
    });
  }

  const firstRequired = fieldNames.find((f) => isFieldRequired(entry.schema, f));
  if (firstRequired && !(firstRequired in args) && !process.stdin.isTTY) {
    const stdin = (await readStdin()).replace(/\n$/, "");
    if (stdin.length > 0) {
      args[firstRequired] = coerceForField(stdin, shape[firstRequired]);
    }
  }

  return args;
}

function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Any failure the CLI reports. Carries the full error envelope so `--json`
 * can emit it verbatim and the prose renderer can print the same content.
 * Exit 1 = usage/validation, 2 = the utility itself returned an error.
 */
class CliError extends Error {
  constructor(
    readonly envelope: ErrorResponse,
    readonly exit: number = 1
  ) {
    super(envelope.error);
  }
}

// ---------------------------------------------------------------------------
// Recovery steps — every error names the exact command(s) to run next.
// ---------------------------------------------------------------------------

function shellQuote(v: unknown): string {
  const str = typeof v === "string" ? v : JSON.stringify(v);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(str) ? str : `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Build `monolith <fn> --a <a> --b 42 ...`: fields the caller already supplied
 * are filled in, fields that are required-but-missing or flagged invalid
 * become `<field>` placeholders, and optional unset fields are omitted.
 */
function commandTemplate(
  entry: DispatchEntry,
  args: Record<string, unknown>,
  invalid: ReadonlySet<string> = new Set()
): { command: string; placeholders: string[] } {
  const parts = [`monolith ${entry.name}`];
  const placeholders: string[] = [];
  for (const key of Object.keys(entry.schema.shape)) {
    const flag = `--${camelToKebab(key)}`;
    const present = key in args && !invalid.has(key);
    if (present) {
      parts.push(`${flag} ${shellQuote(args[key])}`);
    } else if (invalid.has(key) || isFieldRequired(entry.schema, key)) {
      parts.push(`${flag} <${key}>`);
      placeholders.push(`<${key}>`);
    }
  }
  return { command: parts.join(" "), placeholders };
}

function helpStep(entry: DispatchEntry): NextStep {
  return { command: `monolith ${entry.name} --help`, when: "See parameter descriptions and examples" };
}

function recoverySteps(
  entry: DispatchEntry,
  args: Record<string, unknown>,
  invalid: ReadonlySet<string> = new Set()
): NextStep[] {
  const { command, placeholders } = commandTemplate(entry, args, invalid);
  const when =
    placeholders.length > 0
      ? `Substitute ${placeholders.join(", ")} and rerun`
      : "Rerun with only the flags listed";
  return [{ command, when }, helpStep(entry)];
}

/**
 * Turn a Zod failure into the shared INVALID_INPUT envelope, then add the
 * CLI-specific parts: a sentence naming the flags at fault and `next` steps.
 */
function validationError(
  entry: DispatchEntry,
  error: z.ZodError,
  args: Record<string, unknown>
): CliError {
  const envelope = validationErrorResponse(error);
  const issues = envelope.issues ?? [];
  const field = (issue: ValidationIssue) => issue.path.split(".")[0];
  const missing = [...new Set(issues.map(field).filter((f) => f && !(f in args)))];
  const wrong = issues.filter((i) => !missing.includes(field(i)));

  const lines: string[] = [];
  if (missing.length > 0) {
    lines.push(`${entry.name} requires ${missing.map((f) => "--" + camelToKebab(f)).join(" and ")}`);
  }
  for (const issue of wrong) {
    const msg = issue.message.replace(/^Invalid input: /, "");
    lines.push(issue.path ? `--${camelToKebab(field(issue))}: ${msg}` : msg);
  }
  envelope.error = lines.join("\n");

  const invalid = new Set(issues.map(field).filter(Boolean));
  envelope.next = recoverySteps(entry, args, invalid);
  return new CliError(envelope, 1);
}

/** Prose rendering of an error envelope: message, then each step as "why:" + command. */
function formatErrorProse(envelope: ErrorResponse): string {
  const lines = [`error: ${envelope.error}`];
  if (envelope.next && envelope.next.length > 0) {
    lines.push("");
    for (const step of envelope.next) {
      lines.push(`${step.when}:`, `  ${step.command}`);
    }
  }
  return lines.join("\n");
}

/**
 * Single exit point for every error. `--json` puts the envelope on stdout so
 * an agent has one place to parse; otherwise prose goes to stderr. `--quiet`
 * silences stdout only, so prose errors still reach stderr.
 */
function emitError(envelope: ErrorResponse, parsed: ParsedArgv, exit: number): number {
  if (parsed.json) {
    if (!parsed.quiet) process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
  } else {
    process.stderr.write(formatErrorProse(envelope) + "\n");
  }
  return exit;
}

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
  result: SuccessResponse<unknown>,
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
      exit: 0,
    };
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
  --json            Full {success, result, metadata} envelope on stdout.
                    Errors too: {success:false, errorCode, next:[{command, when}]}
  --raw             Line-oriented: arrays one item/line, objects key=value/line
  -q, --quiet       No stdout; boolean results drive exit code (0=true, 1=false)

Exit codes: 0 ok · 1 usage or validation error (or --quiet false) · 2 utility error.
Without --json, errors are printed to stderr with the exact commands to run next.

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
  --json            Full {success, result, metadata} envelope on stdout (errors include next steps)
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
    throw new CliError({
      success: false,
      error: `No functions in category '${category}'.`,
      errorCode: "UNKNOWN_CATEGORY",
      next: [{ command: "monolith list", when: "See available categories" }],
    });
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

function unknownCommandSteps(name: string): NextStep[] {
  const suggestions = searchFunctions(name).slice(0, 3).map((f) => f.name);
  return [
    ...suggestions.map((s) => ({ command: `monolith ${s} --help`, when: `If you meant ${s}` })),
    { command: `monolith search ${shellQuote(name)}`, when: "Search functions by keyword" },
    { command: "monolith list", when: "List all categories" },
  ];
}

function describeCommand(name: string): string {
  const fn = getFunction(name);
  if (!fn) {
    throw new CliError({
      success: false,
      error: `Function '${name}' not found.`,
      errorCode: "UNKNOWN_COMMAND",
      next: unknownCommandSteps(name),
    });
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
      if (!query) {
        throw new CliError({
          success: false,
          error: "search requires a query.",
          errorCode: "MISSING_ARGUMENT",
          next: [{ command: "monolith search <query>", when: "Substitute <query> and rerun" }],
        });
      }
      registerAllFunctions();
      process.stdout.write(searchCommand(query) + "\n");
      return 0;
    }
    if (parsed.command === "describe") {
      const name = parsed.positionals[0];
      if (!name) {
        throw new CliError({
          success: false,
          error: "describe requires a function name.",
          errorCode: "MISSING_ARGUMENT",
          next: [
            { command: "monolith describe <name>", when: "Substitute <name> and rerun" },
            { command: "monolith list", when: "List all categories" },
          ],
        });
      }
      registerAllFunctions();
      process.stdout.write(describeCommand(name) + "\n");
      return 0;
    }

    const entry = getDispatchEntry(parsed.command);
    if (!entry) {
      registerAllFunctions();
      const suggestions = searchFunctions(parsed.command).slice(0, 3).map((f) => f.name);
      const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
      throw new CliError({
        success: false,
        error: `Unknown command: '${parsed.command}'.${hint}`,
        errorCode: "UNKNOWN_COMMAND",
        next: unknownCommandSteps(parsed.command),
      });
    }

    if (parsed.help) {
      registerAllFunctions();
      process.stdout.write(functionHelp(entry));
      return 0;
    }

    const args = await buildArgs(entry, parsed);
    let result;
    try {
      result = entry.execute(args);
    } catch (error) {
      if (error instanceof z.ZodError) throw validationError(entry, error, args);
      throw error;
    }
    if (!result.success) {
      // The utility rejected the input on its own terms (e.g. min > max).
      return emitError({ ...result, next: [helpStep(entry)] }, parsed, 2);
    }
    const out = formatResult(result, { json: parsed.json, raw: parsed.raw, quiet: parsed.quiet });
    if (out.stdout !== null) process.stdout.write(out.stdout + "\n");
    if (out.stderr !== null) process.stderr.write(out.stderr + "\n");
    return out.exit;
  } catch (error) {
    if (error instanceof CliError) return emitError(error.envelope, parsed, error.exit);
    const msg = error instanceof Error ? error.message : String(error);
    return emitError({ success: false, error: msg, errorCode: "CLI_ERROR" }, parsed, 1);
  }
}
