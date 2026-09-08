/**
 * CLI adapter over the shared registry.
 *
 *   monolith <category/function> [args...] [--flag value] [--json|--raw|-q]
 *   monolith pipe <fn> [<fn>...]        value from stdin or --input
 *   monolith batch                      JSONL {"name","args"} on stdin → JSONL
 *   monolith list [category] | search <query> | describe <name> | schema [name]
 *   monolith --help | --version
 */

import { execute, type AnyFunction } from "./core/define.js";
import {
  ErrorCode,
  type ErrorResponse,
  type NextStep,
  type SuccessResponse,
  type ValidationIssue,
} from "./core/responses.js";
import {
  VERSION,
  describeFunction,
  functions,
  getFunction,
  inputJsonSchema,
  listCategories,
  requiredFields,
  searchFunctions,
  splitCategory,
  suggestFunctions,
} from "./core/registry.js";
import { callSchema, runBatch, runPipe } from "./core/compose.js";

// ---------------------------------------------------------------------------
// argv parsing
// ---------------------------------------------------------------------------

interface ParsedArgv {
  command: string | undefined;
  positionals: string[];
  /** `true` marks a bare `--flag` with no value. */
  flags: Record<string, string | true>;
  json: boolean;
  raw: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

const OUTPUT_FLAGS: Record<string, keyof ParsedArgv> = {
  "--json": "json",
  "--raw": "raw",
  "--quiet": "quiet",
  "-q": "quiet",
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "-v": "version",
};

const kebabToCamel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const camelToKebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const looksLikeFlag = (tok: string) => tok.startsWith("--") && tok.length > 2;

export function parseArgv(argv: string[]): ParsedArgv {
  const out: ParsedArgv = {
    command: undefined,
    positionals: [],
    flags: {},
    json: false,
    raw: false,
    quiet: false,
    help: false,
    version: false,
  };
  let onlyPositionals = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!onlyPositionals) {
      if (tok === "--") {
        onlyPositionals = true;
        continue;
      }
      const output = OUTPUT_FLAGS[tok];
      if (output) {
        (out as unknown as Record<string, boolean>)[output] = true;
        continue;
      }
      if (looksLikeFlag(tok)) {
        const eq = tok.indexOf("=");
        if (eq !== -1) {
          out.flags[kebabToCamel(tok.slice(2, eq))] = tok.slice(eq + 1);
        } else {
          const key = kebabToCamel(tok.slice(2));
          const next = argv[i + 1];
          if (next !== undefined && !looksLikeFlag(next) && next !== "--") {
            out.flags[key] = next;
            i++;
          } else {
            out.flags[key] = true;
          }
        }
        continue;
      }
    }
    if (out.command === undefined) out.command = tok;
    else out.positionals.push(tok);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Argument binding
// ---------------------------------------------------------------------------

/** Unwrap optional/default/nullable wrappers and report the inner Zod type name. */
function fieldType(field: unknown): string {
  let cur = field as { def?: { type?: string; innerType?: unknown } } | undefined;
  while (cur?.def) {
    if (
      cur.def.type &&
      cur.def.type !== "optional" &&
      cur.def.type !== "default" &&
      cur.def.type !== "nullable"
    )
      return cur.def.type;
    cur = cur.def.innerType as typeof cur;
  }
  return "unknown";
}

/** Strings pass through verbatim; everything else is JSON-parsed when possible. */
function coerce(raw: string, field: unknown): unknown {
  if (fieldType(field) === "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer | string) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    );
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

async function pipedStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const text = (await readStdin()).replace(/\r?\n$/, "");
  return text.length > 0 ? text : undefined;
}

/**
 * Build the argument object from `--args`, flags, piped stdin, and positionals.
 * Stdin (when present) fills the first required field not given as a flag;
 * positionals then fill the remaining fields in declaration order.
 */
async function buildArgs(fn: AnyFunction, parsed: ParsedArgv): Promise<Record<string, unknown>> {
  const shape = fn.input.shape as Record<string, unknown>;
  const fieldNames = Object.keys(shape);
  const args: Record<string, unknown> = {};

  const { args: argsJson, ...flags } = parsed.flags;
  if (argsJson !== undefined) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(argsJson === true ? "" : argsJson);
    } catch {
      parsedJson = undefined;
    }
    if (parsedJson === null || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
      throw new CliError({
        success: false,
        error: "--args must be a JSON object",
        errorCode: "INVALID_ARGS_JSON",
        next: [
          {
            command: `monolith ${fn.name} --args '{"${fieldNames[0]}": <value>}'`,
            when: "Pass all arguments as one JSON object",
          },
          helpStep(fn),
        ],
      });
    }
    Object.assign(args, parsedJson);
  }

  for (const [key, value] of Object.entries(flags)) {
    if (!(key in shape)) {
      throw new CliError({
        success: false,
        error: `Unknown flag --${camelToKebab(key)} for ${fn.name}. Valid flags: ${fieldNames.map((f) => "--" + camelToKebab(f)).join(", ")}`,
        errorCode: "UNKNOWN_FLAG",
        next: recoverySteps(fn, args),
      });
    }
    if (value === true) {
      if (fieldType(shape[key]) !== "boolean") {
        throw new CliError({
          success: false,
          error: `--${camelToKebab(key)} needs a value`,
          errorCode: "MISSING_VALUE",
          next: recoverySteps(fn, args, new Set([key])),
        });
      }
      args[key] = true;
    } else {
      args[key] = coerce(value, shape[key]);
    }
  }

  const stdin = await pipedStdin();
  if (stdin !== undefined) {
    const target =
      requiredFields(fn).find((f) => !(f in args)) ?? fieldNames.find((f) => !(f in args));
    if (target) args[target] = coerce(stdin, shape[target]);
  }

  const unfilled = fieldNames.filter((f) => !(f in args));
  if (parsed.positionals.length > unfilled.length) {
    throw new CliError({
      success: false,
      error: `Too many positional arguments for ${fn.name}. Fields: ${fieldNames.join(", ")}${stdin !== undefined ? " (stdin already filled one)" : ""}`,
      errorCode: "TOO_MANY_ARGUMENTS",
      next: recoverySteps(fn, args),
    });
  }
  parsed.positionals.forEach((value, i) => {
    args[unfilled[i]] = coerce(value, shape[unfilled[i]]);
  });
  return args;
}

// ---------------------------------------------------------------------------
// Errors and recovery steps
// ---------------------------------------------------------------------------

/** Exit 1 = usage or validation; 2 = the function rejected the input. */
class CliError extends Error {
  constructor(
    readonly envelope: ErrorResponse,
    readonly exit: number = 1
  ) {
    super(envelope.error);
  }
}

export function shellQuote(v: unknown): string {
  const str = typeof v === "string" ? v : JSON.stringify(v);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(str) ? str : `'${str.replace(/'/g, "'\\''")}'`;
}

/** `monolith <fn> --a <a> --b 42`: supplied fields filled in, missing/invalid ones as `<field>` placeholders. */
function commandTemplate(
  fn: AnyFunction,
  args: Record<string, unknown>,
  invalid: ReadonlySet<string> = new Set()
) {
  const required = new Set(requiredFields(fn));
  const parts = [`monolith ${fn.name}`];
  const placeholders: string[] = [];
  for (const key of Object.keys(fn.input.shape)) {
    const flag = `--${camelToKebab(key)}`;
    if (key in args && !invalid.has(key)) parts.push(`${flag} ${shellQuote(args[key])}`);
    else if (invalid.has(key) || required.has(key)) {
      parts.push(`${flag} <${key}>`);
      placeholders.push(`<${key}>`);
    }
  }
  return { command: parts.join(" "), placeholders };
}

const helpStep = (fn: AnyFunction): NextStep => ({
  command: `monolith ${fn.name} --help`,
  when: "See parameter descriptions and examples",
});

function recoverySteps(
  fn: AnyFunction,
  args: Record<string, unknown>,
  invalid: ReadonlySet<string> = new Set()
): NextStep[] {
  const { command, placeholders } = commandTemplate(fn, args, invalid);
  const when =
    placeholders.length > 0
      ? `Substitute ${placeholders.join(", ")} and rerun`
      : "Rerun with only the flags listed";
  return [{ command, when }, helpStep(fn)];
}

/** Reword the shared INVALID_INPUT envelope in terms of flags, and attach recovery steps. */
function validationError(
  fn: AnyFunction,
  envelope: ErrorResponse,
  args: Record<string, unknown>
): CliError {
  const issues = envelope.issues ?? [];
  const field = (issue: ValidationIssue) => issue.path.split(".")[0];
  const missing = [...new Set(issues.map(field).filter((f) => f && !(f in args)))];
  const lines: string[] = [];
  if (missing.length > 0)
    lines.push(`${fn.name} requires ${missing.map((f) => "--" + camelToKebab(f)).join(" and ")}`);
  for (const issue of issues) {
    if (missing.includes(field(issue))) continue;
    const msg = issue.message.replace(/^Invalid input: /, "");
    lines.push(issue.path ? `--${camelToKebab(field(issue))}: ${msg}` : msg);
  }
  const invalid = new Set(issues.map(field).filter(Boolean));
  return new CliError(
    {
      ...envelope,
      error: lines.join("\n") || envelope.error,
      next: recoverySteps(fn, args, invalid),
    },
    1
  );
}

function unknownCommandSteps(name: string): NextStep[] {
  return [
    ...suggestFunctions(name).map((s) => ({
      command: `monolith ${s} --help`,
      when: `If you meant ${s}`,
    })),
    { command: `monolith search ${shellQuote(name)}`, when: "Search functions by keyword" },
    { command: "monolith list", when: "List all categories" },
  ];
}

function unknownFunction(name: string): CliError {
  const suggestions = suggestFunctions(name);
  const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
  return new CliError({
    success: false,
    error: `Unknown function: '${name}'.${hint}`,
    errorCode: ErrorCode.UNKNOWN_FUNCTION,
    next: unknownCommandSteps(name),
  });
}

function missingArgument(command: string, placeholder: string): CliError {
  return new CliError({
    success: false,
    error: `${command} requires ${placeholder}.`,
    errorCode: "MISSING_ARGUMENT",
    next: [
      {
        command: `monolith ${command} ${placeholder}`,
        when: `Substitute ${placeholder} and rerun`,
      },
      { command: "monolith list", when: "List all categories" },
    ],
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatErrorProse(envelope: ErrorResponse): string {
  const lines = [`error: ${envelope.error}`];
  if (envelope.next?.length) {
    lines.push("");
    for (const step of envelope.next) lines.push(`${step.when}:`, `  ${step.command}`);
  }
  return lines.join("\n");
}

/** `--json` puts the envelope on stdout; otherwise prose goes to stderr. `--quiet` silences stdout only. */
function emitError(envelope: ErrorResponse, parsed: ParsedArgv, exit: number): number {
  if (parsed.json) {
    if (!parsed.quiet) process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
  } else {
    process.stderr.write(formatErrorProse(envelope) + "\n");
  }
  return exit;
}

const rawScalar = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);

/** Render a success envelope per the output flags; returns the exit code. */
function emitResult(result: SuccessResponse<unknown>, parsed: ParsedArgv): number {
  const v = result.result;
  // Boolean results drive the exit code under --quiet (grep -q style), whatever the format.
  const exit = parsed.quiet && typeof v === "boolean" && !v ? 1 : 0;
  if (parsed.quiet) return exit;
  let text: string;
  if (parsed.json) text = JSON.stringify(result, null, 2);
  else if (parsed.raw && Array.isArray(v)) text = v.map(rawScalar).join("\n");
  else if (parsed.raw && v !== null && typeof v === "object")
    text = Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}=${rawScalar(val)}`)
      .join("\n");
  else if (typeof v === "string") text = v;
  else if (v === null || typeof v !== "object") text = String(v);
  else text = JSON.stringify(v, null, 2);
  process.stdout.write(text + "\n");
  return exit;
}

/** Discovery commands: JSON envelope under --json, prose otherwise. */
function emitInfo(prose: string, data: unknown, parsed: ParsedArgv): number {
  if (parsed.quiet) return 0;
  process.stdout.write(
    (parsed.json ? JSON.stringify({ success: true, result: data }, null, 2) : prose) + "\n"
  );
  return 0;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function rootHelp(): string {
  return `monolith ${VERSION} — deterministic utility CLI (${functions.length} functions)

Usage:
  monolith <category/function> [args...] [--flag value] [--json|--raw|-q]
  monolith <category/function> --args '{"field": value, ...}'
  monolith pipe <fn> [<fn>...]        # chain functions; value from stdin or --input
  monolith batch                      # JSONL {"name","args"} on stdin → JSONL results
  monolith list [category]            # categories, or functions in one category
  monolith search <query>             # keyword search
  monolith describe <name>            # parameters, return value, examples (JSON)
  monolith schema [name]              # JSON Schema for one or all functions
  monolith --help | --version

Arguments bind in this order: --args JSON, --flags, piped stdin (first required
field), then positionals in declaration order. Values are JSON-parsed unless the
field is a string. Use -- to end flag parsing when a value starts with --.

Examples:
  monolith strings/toCamelCase "hello world"
  echo "hello world" | monolith strings/slugify
  echo "Hello World" | monolith strings/truncate 8
  monolith math/clamp 100 --min 0 --max 50
  monolith dates/addDays --iso-date 2026-05-08 --days 7
  cat config.yaml | monolith conversion/yamlToJson | jq .key
  monolith validation/isEmail "x@y.com" -q && echo ok
  monolith data/arrays/unique '[1,2,2,3]' --raw
  echo "My Post" | monolith pipe strings/slugify encoding/base64Encode

Output flags:
  --json      Full {success, result} envelope on stdout; errors as
              {success:false, errorCode, error, next:[{command, when}]}
  --raw       Line-oriented: arrays one item per line, objects key=value per line
  -q, --quiet No stdout; boolean results set the exit code (0 true, 1 false)

Exit codes: 0 ok · 1 usage or validation error (or --quiet false) · 2 function error.
Without --json, errors go to stderr with the exact commands to run next.

MCP: when stdin is piped and no arguments are given, monolith runs as an MCP
stdio server (set MONOLITH_TOOL_MODE=compact for a 6-tool surface).
`;
}

function functionHelp(fn: AnyFunction): string {
  const meta = describeFunction(fn);
  const params = meta.parameters.map((p) => {
    const def = p.default !== undefined ? ` (default: ${JSON.stringify(p.default)})` : "";
    return `  --${camelToKebab(p.name).padEnd(14)} ${p.required ? "(required)" : "          "} ${p.type.padEnd(8)} ${p.description}${def}`;
  });
  const examples = meta.examples.map((ex) => {
    const args = Object.entries(ex.input as Record<string, unknown>)
      .map(([k, v]) => `--${camelToKebab(k)} ${shellQuote(v)}`)
      .join(" ");
    return `  # ${ex.description}\n  monolith ${fn.name} ${args}\n  ${typeof ex.output === "string" ? ex.output : JSON.stringify(ex.output)}`;
  });
  return `${fn.name} — ${fn.description}

Returns: ${fn.returns}
MCP tool name: ${meta.toolName}

Parameters:
${params.join("\n")}

Examples:
${examples.join("\n\n")}

Flags: --json (envelope) · --raw (line-oriented) · -q/--quiet (exit code only) · --args '<json>'
`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function listCommand(category: string | undefined, parsed: ParsedArgv): number {
  if (!category) {
    const cats = listCategories();
    const prose = `Categories (${functions.length} functions):\n${cats.map((c) => `  ${c.name.padEnd(12)} ${String(c.count).padStart(3)}  ${c.description}`).join("\n")}\n\nRun \`monolith list <category>\` to see its functions.`;
    return emitInfo(prose, { categories: cats }, parsed);
  }
  const fns = functions.filter((f) => splitCategory(f.name) === category);
  if (fns.length === 0) {
    throw new CliError({
      success: false,
      error: `No such category '${category}'.`,
      errorCode: "UNKNOWN_CATEGORY",
      next: [{ command: "monolith list", when: "See available categories" }],
    });
  }
  const prose = `${category} functions:\n${fns.map((f) => `  ${f.name.padEnd(30)} ${f.description}`).join("\n")}`;
  return emitInfo(prose, { functions: fns.map(describeFunction) }, parsed);
}

function searchCommand(query: string, category: string | undefined, parsed: ParsedArgv): number {
  const results = searchFunctions(query, category);
  const prose =
    results.length === 0
      ? `No functions match '${query}'.`
      : `${results.length} match(es) for '${query}':\n${results.map((f) => `  ${f.name.padEnd(30)} ${f.description}`).join("\n")}`;
  return emitInfo(
    prose,
    {
      query,
      count: results.length,
      functions: results.map((f) => ({ name: f.name, description: f.description, tags: f.tags })),
    },
    parsed
  );
}

function describeCommand(name: string, parsed: ParsedArgv): number {
  const fn = getFunction(name);
  if (!fn) throw unknownFunction(name);
  const meta = describeFunction(fn);
  return emitInfo(JSON.stringify(meta, null, 2), meta, parsed);
}

function schemaCommand(name: string | undefined, parsed: ParsedArgv): number {
  if (name) {
    const fn = getFunction(name);
    if (!fn) throw unknownFunction(name);
    const schema = inputJsonSchema(fn);
    return emitInfo(JSON.stringify(schema, null, 2), schema, parsed);
  }
  const all = Object.fromEntries(
    functions.map((fn) => [
      fn.name,
      { description: fn.description, returns: fn.returns, input: inputJsonSchema(fn) },
    ])
  );
  return emitInfo(JSON.stringify(all, null, 2), all, parsed);
}

async function pipeCommand(parsed: ParsedArgv): Promise<number> {
  if (parsed.positionals.length === 0) throw missingArgument("pipe", "<fn> [<fn>...]");
  for (const name of parsed.positionals) if (!getFunction(name)) throw unknownFunction(name);
  const flagInput = parsed.flags.input;
  const raw = typeof flagInput === "string" ? flagInput : await pipedStdin();
  if (raw === undefined) {
    throw new CliError({
      success: false,
      error: "pipe needs a value on stdin or via --input.",
      errorCode: "MISSING_ARGUMENT",
      next: [
        {
          command: `echo <value> | monolith pipe ${parsed.positionals.join(" ")}`,
          when: "Pipe the value in",
        },
      ],
    });
  }
  const first = getFunction(parsed.positionals[0])!;
  const primary = requiredFields(first)[0] ?? Object.keys(first.input.shape)[0];
  const input = coerce(raw, (first.input.shape as Record<string, unknown>)[primary]);
  const outcome = runPipe(
    input,
    parsed.positionals.map((name) => ({ name, args: {} }))
  );
  if (!outcome.success) {
    const step = parsed.positionals[outcome.step];
    return emitError(
      {
        success: false,
        error: `step ${outcome.step} (${step}): ${outcome.error}`,
        errorCode: outcome.errorCode,
        details: outcome,
        next: [{ command: `monolith ${step} --help`, when: "Check that step's parameters" }],
      },
      parsed,
      2
    );
  }
  return emitResult(outcome, parsed);
}

async function batchCommand(parsed: ParsedArgv): Promise<number> {
  const raw = await pipedStdin();
  if (raw === undefined) {
    throw new CliError({
      success: false,
      error: 'batch reads JSONL {"name", "args"} lines from stdin.',
      errorCode: "MISSING_ARGUMENT",
      next: [
        {
          command: `printf '{"name":"strings/slugify","args":{"input":"A B"}}\\n' | monolith batch`,
          when: "Pipe one JSON call per line",
        },
      ],
    });
  }
  const calls = raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, i) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new CliError({
          success: false,
          error: `Line ${i + 1} is not valid JSON.`,
          errorCode: "INVALID_ARGS_JSON",
          next: [
            { command: "monolith batch", when: 'Each line must be {"name": "...", "args": {...}}' },
          ],
        });
      }
      const parsedCall = callSchema.safeParse(value);
      if (!parsedCall.success) {
        throw new CliError({
          success: false,
          error: `Line ${i + 1}: ${parsedCall.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")}`,
          errorCode: ErrorCode.INVALID_INPUT,
          next: [
            { command: "monolith batch", when: 'Each line must be {"name": "...", "args": {...}}' },
          ],
        });
      }
      return parsedCall.data;
    });
  const results = runBatch(calls);
  if (parsed.quiet) return results.every((r) => r.success) ? 0 : 2;
  process.stdout.write(
    parsed.json
      ? JSON.stringify({ success: true, result: { results } }, null, 2) + "\n"
      : results.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  return results.every((r) => r.success) ? 0 : 2;
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv);
  if (parsed.version) {
    process.stdout.write(`monolith ${VERSION}\n`);
    return 0;
  }
  if (parsed.command === undefined) {
    process.stdout.write(rootHelp());
    return 0;
  }
  try {
    switch (parsed.command) {
      case "list":
        return listCommand(parsed.positionals[0], parsed);
      case "search": {
        if (!parsed.positionals[0]) throw missingArgument("search", "<query>");
        const category = parsed.flags.category;
        return searchCommand(
          parsed.positionals.join(" "),
          typeof category === "string" ? category : undefined,
          parsed
        );
      }
      case "describe":
        if (!parsed.positionals[0]) throw missingArgument("describe", "<name>");
        return describeCommand(parsed.positionals[0], parsed);
      case "schema":
        return schemaCommand(parsed.positionals[0], parsed);
      case "pipe":
        return await pipeCommand(parsed);
      case "batch":
        return await batchCommand(parsed);
    }

    const fn = getFunction(parsed.command);
    if (!fn) throw unknownFunction(parsed.command);
    if (parsed.help) {
      process.stdout.write(functionHelp(fn));
      return 0;
    }
    const args = await buildArgs(fn, parsed);
    const result = execute(fn, args);
    if (!result.success) {
      if (result.errorCode === ErrorCode.INVALID_INPUT) throw validationError(fn, result, args);
      return emitError({ ...result, next: [helpStep(fn)] }, parsed, 2);
    }
    return emitResult(result, parsed);
  } catch (error) {
    if (error instanceof CliError) return emitError(error.envelope, parsed, error.exit);
    const message = error instanceof Error ? error.message : String(error);
    return emitError({ success: false, error: message, errorCode: "CLI_ERROR" }, parsed, 1);
  }
}
