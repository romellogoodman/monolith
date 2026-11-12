/**
 * CLI adapter over the shared registry.
 *
 *   monolith <category/function> [<VALUE>...] [--option value] [--json|--raw|-q]
 *   monolith pipe <FUNCTION>...         value from stdin or --input
 *   monolith batch                      JSONL {"name","args"} on stdin → JSONL
 *   monolith list [<CATEGORY>] | search <QUERY> | describe <FUNCTION> | schema [<FUNCTION>]
 *   monolith help [<COMMAND>] | --help | --version
 *
 * Follows the Vercel CLI design guidelines (https://vercel.com/design/cli)
 * where they apply to a local, read-only tool: stdout is the answer, every
 * error carries its recovery, exit 0 ok / 1 failure / 2 usage, --json is an
 * exact contract (one document on stdout, or one error line on stderr).
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

/** 0 completed (including empty results); 1 operational failure or `-q` false; 2 usage or invalid input. */
export const EXIT = { OK: 0, FAILURE: 1, USAGE: 2 } as const;

// ---------------------------------------------------------------------------
// argv parsing
// ---------------------------------------------------------------------------

interface ParsedArgv {
  command: string | undefined;
  positionals: string[];
  /** `true` marks a bare `--option` with no value. */
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
const optionName = (key: string) => `--${camelToKebab(key)}`;
/** `isoDate` → `<ISO_DATE>` */
const placeholder = (key: string) => `<${camelToKebab(key).replace(/-/g, "_").toUpperCase()}>`;

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

/** Piped stdin with one trailing newline dropped; undefined on a TTY or when empty. */
async function pipedStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const text = (await readStdin()).replace(/\r?\n$/, "");
  return text.length > 0 ? text : undefined;
}

/**
 * Build the argument object from `--args`, options, piped stdin, and positionals.
 * Stdin (when present) fills the first required field not given as an option;
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
        error: `Can't parse --args. It must be a JSON object.`,
        errorCode: "INVALID_ARGS_JSON",
        next: [
          {
            command: `monolith ${fn.name} --args '{"${fieldNames[0]}": ${placeholder(fieldNames[0])}}'`,
            when: "Pass all arguments as one JSON object",
          },
          helpStep(fn.name),
        ],
      });
    }
    Object.assign(args, parsedJson);
  }

  for (const [rawKey, value] of Object.entries(flags)) {
    let key = rawKey;
    let bound: unknown = value;
    // --no-<boolean> is the negative form of a boolean option.
    const negated = /^no[A-Z]/.test(rawKey) && rawKey[2].toLowerCase() + rawKey.slice(3);
    if (!(key in shape) && negated && negated in shape && value === true) {
      if (fieldType(shape[negated]) === "boolean") {
        key = negated;
        bound = false;
      }
    }
    if (!(key in shape)) {
      throw new CliError({
        success: false,
        error: `Unknown option ${optionName(rawKey)} for monolith ${fn.name}.\nValid options: ${fieldNames.map(optionName).join(", ")}`,
        errorCode: "UNKNOWN_OPTION",
        next: recoverySteps(fn, args),
      });
    }
    if (bound === true) {
      if (fieldType(shape[key]) !== "boolean") {
        throw new CliError({
          success: false,
          error: `Can't run ${fn.name} without a value for ${optionName(key)}.`,
          errorCode: "MISSING_VALUE",
          next: recoverySteps(fn, args, new Set([key])),
        });
      }
      args[key] = true;
    } else if (typeof bound === "string") {
      args[key] = coerce(bound, shape[key]);
    } else {
      args[key] = bound;
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
      error: `Can't run ${fn.name}. Got ${plural(parsed.positionals.length, "positional argument")} for ${plural(unfilled.length, "unfilled field")}.\nFields in order: ${fieldNames.join(", ")}${stdin !== undefined ? " (stdin filled one)" : ""}`,
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

/** A CLI-level failure with its envelope and exit code (usage by default). */
class CliError extends Error {
  constructor(
    readonly envelope: ErrorResponse,
    readonly exit: number = EXIT.USAGE
  ) {
    super(envelope.error);
  }
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** "a", "a and b", "a, b, and c" */
const conjoin = (items: string[]) =>
  items.length <= 2
    ? items.join(" and ")
    : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;

export function shellQuote(v: unknown): string {
  const str = typeof v === "string" ? v : JSON.stringify(v);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(str) ? str : `'${str.replace(/'/g, "'\\''")}'`;
}

const PLACEHOLDER = /^<[A-Z][A-Z0-9_]*>(\.\.\.)?$/;

/** A recovery step from argv; placeholders render bare, everything else shell-quoted. */
function step(argv: string[], when: string): NextStep {
  const command = argv.map((a) => (PLACEHOLDER.test(a) ? a : shellQuote(a))).join(" ");
  return { command, argv, when };
}

const helpStep = (path: string): NextStep =>
  step(["monolith", path, "--help"], `See ${path === "monolith" ? "usage" : `${path} options`}`);

/** `monolith <fn> --a <a> --b 42`: supplied fields filled in, missing/invalid ones as `<FIELD>` placeholders. */
function commandTemplate(
  fn: AnyFunction,
  args: Record<string, unknown>,
  invalid: ReadonlySet<string> = new Set()
) {
  const required = new Set(requiredFields(fn));
  const argv = ["monolith", fn.name];
  const placeholders: string[] = [];
  for (const key of Object.keys(fn.input.shape)) {
    if (key in args && !invalid.has(key)) {
      const v = args[key];
      argv.push(optionName(key), typeof v === "string" ? v : JSON.stringify(v));
    } else if (invalid.has(key) || required.has(key)) {
      argv.push(optionName(key), placeholder(key));
      placeholders.push(placeholder(key));
    }
  }
  return { argv, placeholders };
}

function recoverySteps(
  fn: AnyFunction,
  args: Record<string, unknown>,
  invalid: ReadonlySet<string> = new Set()
): NextStep[] {
  const { argv, placeholders } = commandTemplate(fn, args, invalid);
  const when =
    placeholders.length > 0
      ? `Rerun with ${conjoin(placeholders)} filled in`
      : "Rerun with only the listed options";
  return [step(argv, when), helpStep(fn.name)];
}

/** Reword the shared INVALID_INPUT envelope in terms of options, and attach recovery steps. */
function validationError(
  fn: AnyFunction,
  envelope: ErrorResponse,
  args: Record<string, unknown>
): CliError {
  const issues = envelope.issues ?? [];
  const field = (issue: ValidationIssue) => issue.path.split(".")[0];
  const missing = [...new Set(issues.map(field).filter((f) => f && !(f in args)))];
  const rows: string[] = [];
  for (const issue of issues) {
    if (missing.includes(field(issue))) continue;
    const msg = issue.message.replace(/^Invalid input: /, "");
    rows.push(issue.path ? `${optionName(field(issue))}: ${msg}` : msg);
  }
  const invalid = new Set(issues.map(field).filter(Boolean));
  const badCount = invalid.size - missing.length;
  const headline =
    missing.length > 0
      ? `Can't run ${fn.name} without ${conjoin(missing.map(optionName))}.`
      : `Can't run ${fn.name}. ${badCount === 1 ? "1 input is" : `${badCount} inputs are`} invalid.`;
  return new CliError({
    ...envelope,
    error: [headline, ...rows].join("\n"),
    next: recoverySteps(fn, args, invalid),
  });
}

/** Unknown function or command: at most one suggestion, plus a search. */
function unknownFunction(name: string, exit: number = EXIT.USAGE): CliError {
  const [suggestion] = suggestFunctions(name, 1);
  const next = suggestion
    ? [helpStep(suggestion), step(["monolith", "search", name], "Search functions by keyword")]
    : [
        step(["monolith", "search", name], "Search functions by keyword"),
        step(["monolith", "list"], "List categories"),
      ];
  return new CliError(
    {
      success: false,
      error: `Unknown function ${name}.${suggestion ? `\nDid you mean ${suggestion}?` : ""}`,
      errorCode: ErrorCode.UNKNOWN_FUNCTION,
      next,
    },
    exit
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** JSON for stdout: 2-space indent on a TTY, one compact line otherwise. */
const jsonText = (v: unknown): string =>
  JSON.stringify(v, null, process.stdout.isTTY ? 2 : undefined);

function formatErrorProse(envelope: ErrorResponse): string {
  const [headline, ...rows] = envelope.error.split("\n");
  const lines = [`Error: ${headline}`, ...rows.map((r) => `  ${r}`)];
  const next = envelope.next ?? [];
  if (next.length > 0) {
    lines.push("");
    for (const s of next.slice(0, 2)) lines.push(`${s.when}:`, `    ${s.command}`);
  }
  return lines.join("\n");
}

/** Errors always go to stderr: prose, or one compact JSON line under --json. */
function emitError(envelope: ErrorResponse, parsed: ParsedArgv, exit: number): number {
  process.stderr.write(
    (parsed.json ? JSON.stringify(envelope) : formatErrorProse(envelope)) + "\n"
  );
  return exit;
}

const rawScalar = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);

/** Render a success envelope per the output flags; returns the exit code. */
function emitResult(result: SuccessResponse<unknown>, parsed: ParsedArgv): number {
  const v = result.result;
  // Boolean results drive the exit code under --quiet (grep -q style), whatever the format.
  const exit = parsed.quiet && typeof v === "boolean" && !v ? EXIT.FAILURE : EXIT.OK;
  if (parsed.quiet) return exit;
  let text: string;
  if (parsed.json) text = jsonText(result);
  else if (parsed.raw && Array.isArray(v)) text = v.map(rawScalar).join("\n");
  else if (parsed.raw && v !== null && typeof v === "object")
    text = Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}=${rawScalar(val)}`)
      .join("\n");
  else if (typeof v === "string") text = v;
  else if (v === null || typeof v !== "object") text = String(v);
  else text = jsonText(v);
  process.stdout.write(text + "\n");
  return exit;
}

/** Discovery commands: the `{success, result}` envelope under --json, human text otherwise. */
function emitInfo(human: string, data: unknown, parsed: ParsedArgv): number {
  if (parsed.quiet) return EXIT.OK;
  const text = parsed.json ? jsonText({ success: true, result: data }) : human;
  if (text) process.stdout.write(text + "\n");
  return EXIT.OK;
}

/** Optional guidance for humans; stderr only, never under --json or --quiet. */
function emitHint(when: string, command: string, parsed: ParsedArgv): void {
  if (parsed.json || parsed.quiet) return;
  process.stderr.write(`\n${when}:\n    ${command}\n`);
}

/**
 * A borderless table. On a TTY: aligned columns with a header. Otherwise:
 * header kept, one tab between columns, never padded or truncated.
 */
function table(headers: string[], rows: string[][]): string {
  const all = [headers, ...rows];
  if (!process.stdout.isTTY) return all.map((r) => r.join("\t")).join("\n");
  const widths = headers.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all
    .map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i]))).join("  "))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

const WIDTH = 80;

/** Greedy word wrap; never breaks a word, command, or URL. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

/** Two-column help entries indented 2; a description that doesn't fit moves below its label. */
function helpRows(rows: Array<[string, string]>): string {
  const col = Math.min(30, Math.max(...rows.map(([l]) => l.length)) + 4);
  return rows
    .flatMap(([label, desc]) => {
      const head = `  ${label}`;
      const body = wrap(desc, WIDTH - col);
      const pad = " ".repeat(col);
      return head.length + 2 <= col
        ? [head.padEnd(col) + body[0], ...body.slice(1).map((l) => pad + l)]
        : [head, ...body.map((l) => pad + l)];
    })
    .join("\n");
}

const section = (title: string, body: string) => `${title}:\n${body}`;
const prose = (text: string) =>
  wrap(text, WIDTH - 2)
    .map((l) => `  ${l}`)
    .join("\n");

interface BuiltinOption {
  hint?: string;
  description: string;
}

interface Builtin {
  args: string;
  summary: string;
  options?: Record<string, BuiltinOption>;
  minPositionals: number;
  maxPositionals: number;
  examples: string[];
  notes?: string[];
}

const BUILTINS: Record<string, Builtin> = {
  list: {
    args: "[<CATEGORY>]",
    summary: "List categories, or the functions in one category",
    minPositionals: 0,
    maxPositionals: 1,
    examples: ["monolith list", "monolith list strings"],
  },
  search: {
    args: "<QUERY>",
    summary: "Search functions by name, description, and tags",
    options: { category: { hint: "<CATEGORY>", description: "Only search this category" } },
    minPositionals: 1,
    maxPositionals: Infinity,
    examples: ["monolith search hash", "monolith search case --category strings"],
    notes: ["No matches is not an error: it prints a notice to stderr and exits 0."],
  },
  describe: {
    args: "<FUNCTION>",
    summary: "Print a function's parameters, return value, and examples as JSON",
    minPositionals: 1,
    maxPositionals: 1,
    examples: ["monolith describe strings/truncate"],
  },
  schema: {
    args: "[<FUNCTION>]",
    summary: "Print the input JSON Schema for one function, or for all of them",
    minPositionals: 0,
    maxPositionals: 1,
    examples: ["monolith schema strings/truncate"],
  },
  pipe: {
    args: "<FUNCTION>...",
    summary: "Chain functions, feeding each result to the next function's primary field",
    options: { input: { hint: "<VALUE>", description: "Starting value (default: piped stdin)" } },
    minPositionals: 1,
    maxPositionals: Infinity,
    examples: [
      "echo 'My Post' | monolith pipe strings/slugify encoding/base64Encode",
      "monolith pipe strings/trim strings/toUpperCase --input '  hi  '",
    ],
    notes: ["Stops at the first failing step, names it, and exits 1."],
  },
  batch: {
    args: "",
    summary: 'Run one {"name", "args"} call per JSONL line on stdin',
    minPositionals: 0,
    maxPositionals: 0,
    examples: [`printf '{"name":"strings/slugify","args":{"input":"A B"}}\\n' | monolith batch`],
    notes: [
      "Writes one result envelope per line in input order. Exits 1 if any call failed; the successful results are still written.",
    ],
  },
  help: {
    args: "[<COMMAND>]",
    summary: "Show help for monolith, a command, or a function",
    minPositionals: 0,
    maxPositionals: 1,
    examples: ["monolith help strings/truncate"],
  },
};

const GLOBAL_OPTIONS: Array<[string, string]> = [
  ["--args <JSON>", "Pass every argument as one JSON object"],
  ["-h, --help", "Show help; with --json, print it as JSON"],
  [
    "--json",
    "Print the {success, result} envelope on stdout; errors go to stderr as one JSON line",
  ],
  ["-q, --quiet", "Print nothing on stdout; a false boolean result exits 1"],
  ["--raw", "Print arrays one item per line and objects as key=value lines"],
  ["-v, --version", "Show the version"],
];

function rootHelp(): string {
  return [
    `monolith ${VERSION}\n${prose(`Run ${functions.length} deterministic utility functions from the shell or over MCP`)}`,
    section(
      "Usage",
      "  monolith <FUNCTION> [<VALUE>...] [options]\n  monolith <COMMAND> [options]"
    ),
    section(
      "Commands",
      helpRows(Object.entries(BUILTINS).map(([name, b]) => [`${name} ${b.args}`.trim(), b.summary]))
    ),
    section("Options", helpRows(GLOBAL_OPTIONS)),
    section(
      "Examples",
      [
        "monolith strings/toCamelCase 'hello world'",
        "echo 'Hello World' | monolith strings/truncate 8",
        "monolith dates/addDays --iso-date 2026-05-08 --days 7",
        "monolith validation/isEmail x@y.com -q && echo valid",
        "monolith data/arrays/unique '[1,2,2,3]' --raw",
        "cat config.yaml | monolith conversion/yamlToJson | jq .key",
      ]
        .map((c) => `    ${c}`)
        .join("\n")
    ),
    section(
      "Notes",
      [
        "Arguments bind in this order: --args JSON, options, piped stdin (first required field), then positionals in declaration order. Values are JSON-parsed unless the field is a string. Use -- to end option parsing when a value starts with --.",
        "Exit codes: 0 success, 1 the function failed or -q saw false, 2 usage error or invalid input, 130 interrupted.",
        "With no arguments and piped stdin, monolith runs as an MCP stdio server. Set MONOLITH_TOOL_MODE=compact for a 6-tool surface.",
      ]
        .map(prose)
        .join("\n\n")
    ),
  ].join("\n\n");
}

function builtinHelp(name: string, b: Builtin): string {
  const parts = [
    section(
      "Usage",
      `  monolith ${name} ${b.args ? b.args + " " : ""}[options]\n\n${prose(b.summary)}`
    ),
  ];
  if (b.options)
    parts.push(
      section(
        "Options",
        helpRows(
          Object.entries(b.options).map(([k, o]) => [
            `${optionName(k)} ${o.hint ?? ""}`.trim(),
            o.description,
          ])
        )
      )
    );
  parts.push(
    section("Global Options", prose("--json, -q/--quiet, -h/--help. See monolith --help."))
  );
  parts.push(section("Examples", b.examples.map((c) => `    ${c}`).join("\n")));
  if (b.notes) parts.push(section("Notes", b.notes.map(prose).join("\n\n")));
  return parts.join("\n\n");
}

const TYPE_HINT: Record<string, string> = {
  string: "<TEXT>",
  number: "<NUMBER>",
  integer: "<NUMBER>",
};

function functionHelp(fn: AnyFunction): string {
  const meta = describeFunction(fn);
  const usageArgs = meta.parameters
    .map((p) => (p.required ? placeholder(p.name) : `[${placeholder(p.name)}]`))
    .join(" ");
  const options = meta.parameters.map((p): [string, string] => {
    const hint = p.type === "boolean" ? "" : ` ${TYPE_HINT[p.type] ?? "<JSON>"}`;
    const label =
      p.type === "boolean"
        ? `${optionName(p.name)}, --no-${camelToKebab(p.name)}`
        : optionName(p.name) + hint;
    const desc = [
      p.required ? "(required)" : "",
      p.description,
      p.enum ? `(accepted: ${p.enum.map(String).join(", ")})` : "",
      p.default !== undefined ? `(default: ${JSON.stringify(p.default)})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return [label, desc];
  });
  const examples = meta.examples.map((ex) => {
    const argv = Object.entries(ex.input as Record<string, unknown>)
      .map(([k, v]) => `${optionName(k)} ${shellQuote(v)}`)
      .join(" ");
    const output = typeof ex.output === "string" ? ex.output : JSON.stringify(ex.output);
    return `  ${ex.description}\n    monolith ${fn.name} ${argv}\n    => ${output}`;
  });
  return [
    section("Usage", `  monolith ${fn.name} ${usageArgs} [options]\n\n${prose(fn.description)}`),
    section("Options", helpRows(options)),
    section(
      "Global Options",
      prose("--args, --json, --raw, -q/--quiet, -h/--help. See monolith --help.")
    ),
    section("Examples", examples.join("\n\n")),
    section(
      "Notes",
      [
        `Returns ${fn.returns}`,
        "Positionals and piped stdin fill options in the order listed above.",
        `MCP tool name: ${meta.toolName}`,
      ]
        .map(prose)
        .join("\n")
    ),
  ].join("\n\n");
}

/** Help for any path. Works offline, does no work, skips all other validation. */
function showHelp(path: string | undefined, parsed: ParsedArgv): number {
  if (path === undefined || path === "monolith") {
    const data = {
      path: "monolith",
      version: VERSION,
      commands: Object.entries(BUILTINS).map(([name, b]) => ({ path: name, summary: b.summary })),
      categories: listCategories(),
    };
    process.stdout.write((parsed.json ? jsonText(data) : rootHelp()) + "\n");
    return EXIT.OK;
  }
  const builtin = BUILTINS[path];
  if (builtin) {
    const data = {
      path,
      summary: builtin.summary,
      arguments: builtin.args,
      options: builtin.options ?? {},
    };
    process.stdout.write((parsed.json ? jsonText(data) : builtinHelp(path, builtin)) + "\n");
    return EXIT.OK;
  }
  const fn = getFunction(path);
  if (!fn) throw unknownFunction(path);
  process.stdout.write((parsed.json ? jsonText(describeFunction(fn)) : functionHelp(fn)) + "\n");
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Leaf commands reject unknown options and wrong positional counts before any work. */
function checkBuiltinUsage(name: string, parsed: ParsedArgv): void {
  const b = BUILTINS[name];
  const allowed = Object.keys(b.options ?? {});
  for (const key of Object.keys(parsed.flags)) {
    if (!allowed.includes(key)) {
      throw new CliError({
        success: false,
        error: `Unknown option ${optionName(key)} for monolith ${name}.${allowed.length ? `\nValid options: ${allowed.map(optionName).join(", ")}` : ""}`,
        errorCode: "UNKNOWN_OPTION",
        next: [helpStep(name)],
      });
    }
  }
  const n = parsed.positionals.length;
  const usage = `monolith ${name} ${b.args}`.trim();
  if (n < b.minPositionals) {
    const missing = b.args.split(" ")[0].replace(/\.\.\.$/, "");
    throw new CliError({
      success: false,
      error: `Can't run monolith ${name} without ${missing}.`,
      errorCode: "MISSING_ARGUMENT",
      next: [
        { command: usage, when: `Rerun with ${missing} filled in` },
        step(["monolith", "list"], "List categories"),
      ],
    });
  }
  if (n > b.maxPositionals) {
    throw new CliError({
      success: false,
      error: `Too many arguments for monolith ${name}. Expected ${b.args || "none"}, got ${plural(n, "argument")}.`,
      errorCode: "TOO_MANY_ARGUMENTS",
      next: [helpStep(name)],
    });
  }
}

const notFoundCategory = (category: string) =>
  new CliError(
    {
      success: false,
      error: `Couldn't find category ${category}.`,
      errorCode: "UNKNOWN_CATEGORY",
      next: [step(["monolith", "list"], "See the available categories")],
    },
    EXIT.FAILURE
  );

function listCommand(category: string | undefined, parsed: ParsedArgv): number {
  if (!category) {
    const cats = listCategories();
    const code = emitInfo(
      table(
        ["Category", "Functions", "Description"],
        cats.map((c) => [c.name, String(c.count), c.description])
      ),
      { categories: cats },
      parsed
    );
    emitHint("See the functions in one category", "monolith list <CATEGORY>", parsed);
    return code;
  }
  const fns = functions.filter((f) => splitCategory(f.name) === category);
  if (fns.length === 0) throw notFoundCategory(category);
  return emitInfo(
    table(
      ["Function", "Description"],
      fns.map((f) => [f.name, f.description])
    ),
    { functions: fns.map(describeFunction) },
    parsed
  );
}

function searchCommand(query: string, category: string | undefined, parsed: ParsedArgv): number {
  if (category !== undefined && !listCategories().some((c) => c.name === category))
    throw notFoundCategory(category);
  const results = searchFunctions(query, category);
  const data = {
    query,
    count: results.length,
    functions: results.map((f) => ({ name: f.name, description: f.description, tags: f.tags })),
  };
  if (results.length === 0 && !parsed.json) {
    // Empty is success: the notice goes to stderr; a pipe still gets the header.
    if (!parsed.quiet) {
      const where = category ? ` in ${category}. Remove --category to search all functions` : "";
      process.stderr.write(`No functions match "${query}"${where}.\n`);
      if (!process.stdout.isTTY) process.stdout.write("Function\tDescription\n");
    }
    return EXIT.OK;
  }
  return emitInfo(
    table(
      ["Function", "Description"],
      results.map((f) => [f.name, f.description])
    ),
    data,
    parsed
  );
}

function describeCommand(name: string, parsed: ParsedArgv): number {
  const fn = getFunction(name);
  if (!fn) throw unknownFunction(name, EXIT.FAILURE);
  const meta = describeFunction(fn);
  return emitInfo(jsonText(meta), meta, parsed);
}

function schemaCommand(name: string | undefined, parsed: ParsedArgv): number {
  if (name) {
    const fn = getFunction(name);
    if (!fn) throw unknownFunction(name, EXIT.FAILURE);
    const schema = inputJsonSchema(fn);
    return emitInfo(jsonText(schema), schema, parsed);
  }
  const all = Object.fromEntries(
    functions.map((fn) => [
      fn.name,
      { description: fn.description, returns: fn.returns, input: inputJsonSchema(fn) },
    ])
  );
  return emitInfo(jsonText(all), all, parsed);
}

async function pipeCommand(parsed: ParsedArgv): Promise<number> {
  for (const name of parsed.positionals) if (!getFunction(name)) throw unknownFunction(name);
  const flagInput = parsed.flags.input;
  if (flagInput === true) {
    throw new CliError({
      success: false,
      error: "Can't run pipe without a value for --input.",
      errorCode: "MISSING_VALUE",
      next: [helpStep("pipe")],
    });
  }
  const raw = flagInput ?? (await pipedStdin());
  if (raw === undefined) {
    throw new CliError({
      success: false,
      error: "Can't run pipe without a starting value on stdin or --input.",
      errorCode: "MISSING_ARGUMENT",
      next: [
        {
          command: `echo <VALUE> | monolith pipe ${parsed.positionals.join(" ")}`,
          when: "Pipe the value in",
        },
        step(
          ["monolith", "pipe", ...parsed.positionals, "--input", "<VALUE>"],
          "Or pass it as an option"
        ),
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
    const failed = parsed.positionals[outcome.step];
    const issues = (outcome.issues as ValidationIssue[] | undefined) ?? [];
    const detail =
      issues.length > 0
        ? issues.map((i) => `${i.path ? optionName(i.path.split(".")[0]) + ": " : ""}${i.message}`)
        : [outcome.error];
    return emitError(
      {
        success: false,
        error: `Step ${outcome.step + 1} of ${parsed.positionals.length} (${failed}) failed.\n${detail.join("\n")}`,
        errorCode: outcome.errorCode,
        details: outcome,
        next: [helpStep(failed)],
      },
      parsed,
      EXIT.FAILURE
    );
  }
  return emitResult(outcome, parsed);
}

async function batchCommand(parsed: ParsedArgv): Promise<number> {
  const raw = await pipedStdin();
  if (raw === undefined) {
    throw new CliError({
      success: false,
      error: "Can't run batch without JSONL calls on stdin.",
      errorCode: "MISSING_ARGUMENT",
      next: [
        {
          command: `printf '{"name":"strings/slugify","args":{"input":"A B"}}\\n' | monolith batch`,
          when: "Pipe one JSON call per line",
        },
      ],
    });
  }
  const lineShape = {
    command: "monolith batch --help",
    when: 'Each line is {"name": "...", "args": {...}}',
  };
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
          error: `Can't parse line ${i + 1}. It isn't valid JSON.`,
          errorCode: "INVALID_ARGS_JSON",
          next: [lineShape],
        });
      }
      const parsedCall = callSchema.safeParse(value);
      if (!parsedCall.success) {
        throw new CliError({
          success: false,
          error: `Can't run line ${i + 1}.\n${parsedCall.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("\n")}`,
          errorCode: ErrorCode.INVALID_INPUT,
          next: [lineShape],
        });
      }
      return parsedCall.data;
    });
  const results = runBatch(calls);
  const exit = results.every((r) => r.success) ? EXIT.OK : EXIT.FAILURE;
  if (parsed.quiet) return exit;
  process.stdout.write(
    parsed.json
      ? jsonText({ success: true, result: { results } }) + "\n"
      : results.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  return exit;
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgv(argv);
  try {
    // Help wins over everything, including --version and other validation.
    if (parsed.help) {
      if (parsed.command === "help") return showHelp(parsed.positionals[0], parsed);
      return showHelp(parsed.command, parsed);
    }
    if (parsed.version) {
      process.stdout.write(
        (parsed.json ? jsonText({ version: VERSION }) : `monolith ${VERSION}`) + "\n"
      );
      return EXIT.OK;
    }
    if (parsed.command === undefined) {
      const [unknown] = Object.keys(parsed.flags);
      if (unknown !== undefined) {
        throw new CliError({
          success: false,
          error: `Unknown option ${optionName(unknown)} for monolith.`,
          errorCode: "UNKNOWN_OPTION",
          next: [helpStep("monolith")],
        });
      }
      return showHelp(undefined, parsed);
    }

    if (parsed.command in BUILTINS) checkBuiltinUsage(parsed.command, parsed);
    switch (parsed.command) {
      case "help":
        return showHelp(parsed.positionals[0], parsed);
      case "list":
        return listCommand(parsed.positionals[0], parsed);
      case "search": {
        const category = parsed.flags.category;
        if (category === true) {
          throw new CliError({
            success: false,
            error: "Can't run search without a value for --category.",
            errorCode: "MISSING_VALUE",
            next: [step(["monolith", "list"], "See the available categories")],
          });
        }
        return searchCommand(parsed.positionals.join(" "), category, parsed);
      }
      case "describe":
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
    const args = await buildArgs(fn, parsed);
    const result = execute(fn, args);
    if (!result.success) {
      if (result.errorCode === ErrorCode.INVALID_INPUT) throw validationError(fn, result, args);
      return emitError({ ...result, next: [helpStep(fn.name)] }, parsed, EXIT.FAILURE);
    }
    return emitResult(result, parsed);
  } catch (error) {
    if (error instanceof CliError) return emitError(error.envelope, parsed, error.exit);
    const message = error instanceof Error ? error.message : String(error);
    return emitError(
      {
        success: false,
        error:
          `Unexpected error in monolith ${parsed.command ?? ""}. This is a bug in monolith.\n${message}`.replace(
            " .",
            "."
          ),
        errorCode: "INTERNAL_ERROR",
      },
      parsed,
      EXIT.FAILURE
    );
  }
}
