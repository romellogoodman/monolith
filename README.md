# Monolith

Deterministic utility functions for AI agents: **123 pure, tested functions** across 13 categories, exposed through **two surfaces that share one registry**, an MCP stdio server and a POSIX-style CLI. Same binary. Same function definitions. Same result for the same input, every time, on every host.

Agents call tested functions instead of regenerating them: string case conversion, slugs, hashing, base64, JSON/YAML/CSV/XML conversion, UTC date arithmetic, correct rounding, JMESPath queries, JSON diff/patch, semver ranges, path and URL manipulation, regex testing, color math, and more.

## Install

```bash
git clone https://github.com/romellogoodman/monolith
cd monolith
npm install        # also builds dist/ via the prepare script
npm link           # puts `monolith` on your PATH
monolith --version
```

Requires Node 22.2 or newer.

**Mode selection:** `monolith <args>` runs the CLI. `monolith` with piped stdin (how MCP clients launch it) runs the MCP server. `monolith` from a terminal prints help.

## CLI

```bash
monolith strings/toCamelCase "hello world"          # helloWorld
echo "My Blog Post!" | monolith strings/slugify      # my-blog-post
echo "Hello World" | monolith strings/truncate 8      # Hello...
monolith math/round 1.005 --decimals 2               # 1.01
monolith dates/addDays --iso-date 2026-05-08 --days 7
cat config.yaml | monolith conversion/yamlToJson | jq .key
monolith json/query --input "$(cat data.json)" --expression "items[?price > \`10\`].name"
monolith semver/satisfies 1.4.2 "^1.2.0" -q && echo compatible
monolith validation/isEmail "x@y.com" -q && echo ok
monolith data/arrays/unique '[1,2,2,3]' --raw
echo "My Post" | monolith pipe strings/slugify encoding/base64Encode
```

**Argument binding**, in order: `--args '<json object>'`, `--option value` (kebab-case, `--option=value` also works; booleans also take `--no-option`), piped stdin (fills the first required field), then positionals in declaration order. Values are JSON-parsed unless the field is a string. Use `--` to stop option parsing when a value begins with `--`.

**Output options**

| Option | Effect |
|---|---|
| (none) | Scalars raw; objects and arrays as JSON (indented on a TTY, one line when piped) |
| `--json` | `{ success, result }` envelope on stdout. On failure, stdout is empty and stderr gets one line: `{ success: false, error, errorCode, issues?, next: [{ command, argv, when }] }` |
| `--raw` | Line-oriented: arrays one item per line, objects `key=value` per line |
| `-q`, `--quiet` | No stdout; boolean results set the exit code (0 true, 1 false) |

**Exit codes:** `0` success (including an empty search), `1` the function failed (or `--quiet` saw false, or some `batch` call failed), `2` usage error or invalid input, `130` interrupted (`128 + n` for signal `n`).

Listings (`list`, `search`) print aligned tables on a TTY and tab-separated rows with a header row when piped.

**Errors carry their recovery.** Every error names the exact commands to run next; without `--json` this goes to stderr:

```
$ monolith strings/truncate hello
Error: Can't run strings/truncate without --length.

Rerun with <LENGTH> filled in:
    monolith strings/truncate --input hello --length <LENGTH>
See strings/truncate options:
    monolith strings/truncate --help
```

The CLI follows [Vercel's CLI design guidelines](https://vercel.com/design/cli) where they apply to a local, read-only tool. The intended deviations: `-q` means `--quiet` (grep-style), not `--query`; `--raw` is an extra output mode; JSON results use the `{ success, result }` envelope that MCP shares instead of the guide's per-noun shapes.

**Discovery and composition**

```bash
monolith list                      # categories with counts
monolith list dates                # functions in one category
monolith search "json diff"        # keyword search, best matches first
monolith describe json/patch       # parameters, return value, examples (JSON)
monolith schema [name]             # JSON Schema for one or every function
monolith <fn> --help               # parameters and runnable examples (also: monolith help <fn>)
monolith <fn> --help --json        # the same, as JSON
monolith pipe <fn> [<fn>...]       # chain functions; value from stdin or --input
printf '{"name":"strings/slugify","args":{"input":"A B"}}\n' | monolith batch   # JSONL in, JSONL out
```

Every discovery command accepts `--json`.

## MCP

Configure any stdio MCP client to run `monolith` (or `node /path/to/monolith/dist/index.js`); see [docs/mcp_integration.md](docs/mcp_integration.md). The server sends `instructions` describing what it is for, and every tool is annotated `readOnlyHint`, `idempotentHint`, and `openWorldHint: false`. Results come back as text and as `structuredContent`.

MCP tool names use underscores (`strings_toCamelCase`); the canonical `strings/toCamelCase` form is accepted everywhere too.

| Mode | Tools exposed | When |
|---|---|---|
| `full` (default) | `search_functions`, `list_categories`, `describe_function`, `batch`, `pipe`, plus one tool per function | Clients with tool search or deferred schemas (Claude Code) |
| `compact` (`MONOLITH_TOOL_MODE=compact`) | The five above plus `run` (`{ name, args }`) | Clients that load every schema up front |

`batch` runs independent calls in one request. `pipe` threads a value through several functions so one call replaces a chain of round trips.

## Response envelope

```json
{ "success": true, "result": "helloWorld" }
```

```json
{
  "success": false,
  "error": "min (5) cannot be greater than max (1)",
  "errorCode": "INVALID_RANGE"
}
```

Schema failures use `errorCode: "INVALID_INPUT"` with an `issues: [{ path, message, code }]` list, identical over MCP and the CLI. Framework codes are `INVALID_INPUT`, `EXECUTION_ERROR`, and `UNKNOWN_FUNCTION`; each function documents its own (`INVALID_DATE`, `PARSE_ERROR`, `INVALID_RANGE`, …).

## Functions
#### color (4) — CSS color conversion, WCAG contrast, mixing, and HSL adjustment

- `color/convert` — Parse a color in any common notation (hex, rgb()/rgba(), hsl()/hsla(), CSS name) and return it in every notation at once: hex, rgb, hsl and CSS strings.
- `color/contrast` — WCAG 2.1 contrast ratio between a foreground and background color, with pass/fail flags for AA and AAA at normal and large text sizes.
- `color/mix` — Blend two colors in sRGB.
- `color/adjust` — Lighten, darken, saturate, desaturate or rotate the hue of a color by HSL deltas, and/or set its alpha.

#### conversion (7) — CSV, YAML, XML, Markdown, and table format conversion

- `conversion/jsonToCsv` — Convert an array of flat objects to CSV with a header row.
- `conversion/csvToJson` — Parse comma-separated CSV with a header row into an array of objects.
- `conversion/yamlToJson` — Parse YAML into a JSON value (objects, arrays, strings, numbers, booleans, null).
- `conversion/jsonToYaml` — Serialize a JSON value as YAML with sorted keys.
- `conversion/xmlToJson` — Parse well-formed XML into a JSON object.
- `conversion/markdownToHtml` — Render GitHub-flavored Markdown to HTML.
- `conversion/jsonToMarkdownTable` — Render an array of objects as a GitHub-flavored Markdown table.

#### data (19) — Array and object helpers: unique, sort, group, flatten, pick, omit

- `data/arrays/unique` — Remove duplicate values from an array, keeping first occurrences.
- `data/arrays/sortBy` — Sort an array of objects by one key, stably.
- `data/arrays/groupBy` — Group an array of objects into buckets keyed by the value of `key`.
- `data/arrays/countBy` — Count how many objects share each value of `key`.
- `data/arrays/keyBy` — Index an array of objects by the value of `key`, producing a lookup object.
- `data/arrays/flatten` — Flatten nested arrays to a given depth, or completely when `depth` is omitted.
- `data/arrays/chunk` — Split an array into consecutive groups of `size`.
- `data/arrays/zip` — Pair up two arrays by position into [a[i], b[i]] tuples.
- `data/arrays/intersection` — Values present in both arrays, compared by content (objects and arrays included).
- `data/arrays/difference` — Values in `a` that do not appear in `b`, compared by content.
- `data/arrays/range` — Numbers from `start` up to but not including `end`, in increments of `step` (default 1; may be negative or fractional).
- `data/objects/pick` — Copy only the listed keys from an object.
- `data/objects/omit` — Copy an object without the listed keys.
- `data/objects/get` — Read a nested value by path, e.g.
- `data/objects/set` — Return a copy of the object with `value` written at `path`, creating intermediate objects (or arrays, for numeric segments) as needed.
- `data/objects/deepMerge` — Recursively merge `sources` into `target`, left to right, returning a new object.
- `data/objects/flattenKeys` — Flatten a nested object into a single level with joined keys, e.g.
- `data/objects/unflattenKeys` — Rebuild a nested object from joined keys, the inverse of flattenKeys: {"a.b.0": 1} → {a:{b:[1]}}.
- `data/objects/deepEqual` — Structural equality of two JSON values: same keys and values at every depth, regardless of key order.

#### dates (13) — ISO 8601 parsing, formatting, and arithmetic, always in UTC

- `dates/parseDate` — Normalize a date string to full ISO 8601 UTC (2025-12-11T00:00:00.000Z).
- `dates/formatDate` — Render an ISO date with a date-fns pattern (yyyy-MM-dd, MMMM d yyyy, HH:mm, EEEE …) in UTC.
- `dates/addDays` — Add (or with a negative count, subtract) whole days to an ISO date, in UTC.
- `dates/diffDays` — Whole UTC calendar days between two ISO dates (`to` minus `from`).
- `dates/toUnix` — Convert an ISO date to a Unix timestamp, as both whole seconds and milliseconds.
- `dates/fromUnix` — Convert a Unix timestamp to ISO 8601 UTC.
- `dates/diff` — Signed difference between two ISO dates (`to` minus `from`) in a chosen unit.
- `dates/add` — Add (or with a negative amount, subtract) a number of seconds, minutes, hours, days, weeks, months or years to an ISO date, in UTC.
- `dates/addDuration` — Add an ISO 8601 duration (P1Y2M3DT4H5M6S, PT30M, P2W; a leading - subtracts) to an ISO date, in UTC.
- `dates/startOf` — First instant (00:00:00.000 UTC) of the day, week (Monday start), month, quarter or year containing an ISO date.
- `dates/endOf` — Last instant (23:59:59.999 UTC) of the day, week (ends Sunday), month, quarter or year containing an ISO date.
- `dates/info` — Calendar facts about an ISO date in UTC: year, month, day, weekday (0 = Sunday) and name, day of year, ISO week and week-year, quarter, leap year, weekend, days in month.
- `dates/toTimezone` — Express a UTC instant as local wall-clock time in an IANA time zone (America/New_York, Europe/Berlin, Asia/Kolkata …), DST-aware, with the numeric offset.

#### encoding (16) — Base64, hex, URL encoding, hashes, HMAC, CRC32, UUID v5, JWT decoding

- `encoding/base64Encode` — Encode UTF-8 text as standard base64 (+ / with = padding).
- `encoding/base64Decode` — Decode base64 (standard or URL-safe alphabet, padding optional, whitespace ignored) to UTF-8 text.
- `encoding/base64UrlEncode` — Encode UTF-8 text as URL-safe base64 (- _ alphabet, no padding) as used in JWTs and PKCE.
- `encoding/urlEncode` — Percent-encode text for use inside a URL component (encodeURIComponent).
- `encoding/urlDecode` — Decode a percent-encoded URL component.
- `encoding/hexEncode` — Encode UTF-8 text as lowercase hexadecimal.
- `encoding/hexDecode` — Decode hexadecimal to UTF-8 text.
- `encoding/hashSha256` — SHA-256 digest of UTF-8 text as 64 lowercase hex characters.
- `encoding/hashSha1` — SHA-1 digest of UTF-8 text as 40 lowercase hex characters (git object ids, legacy checksums; not for security).
- `encoding/hashSha512` — SHA-512 digest of UTF-8 text as 128 lowercase hex characters.
- `encoding/hashMd5` — MD5 digest of UTF-8 text as 32 lowercase hex characters (cache keys and legacy checksums; not for security).
- `encoding/crc32` — CRC-32 checksum of UTF-8 text as 8 lowercase hex characters (zip/png polynomial).
- `encoding/hmacSha256` — HMAC-SHA256 of UTF-8 text with a UTF-8 secret key, as 64 lowercase hex characters (webhook signatures, API auth).
- `encoding/base64UrlDecode` — Decode URL-safe base64 (padding optional) to UTF-8 text.
- `encoding/uuidV5` — Deterministic name-based UUID (version 5).
- `encoding/jwtDecode` — Decode a JSON Web Token into header, payload, and signature WITHOUT verifying it.

#### json (9) — Query (JMESPath, JSON Pointer), diff and patch (RFC 6902), format, JSONC, schema validation

- `json/query` — Evaluate a JMESPath `expression` against a JSON value `input` (e.g.
- `json/pointer` — Look up an RFC 6901 JSON Pointer such as `/users/0/name` in a JSON value.
- `json/diff` — Compute the RFC 6902 JSON Patch (add/remove/replace operations) that turns `from` into `to`.
- `json/patch` — Apply an RFC 6902 JSON Patch (`operations`: add, remove, replace, move, copy, test) to a JSON value and return the new document.
- `json/format` — Pretty-print a JSON value as text with `indent` spaces per level (0 for a single line).
- `json/minify` — Parse JSON text and re-serialize it with all insignificant whitespace removed.
- `json/sortKeys` — Return a copy of a JSON value with every object's keys sorted (code-unit order) at all depths.
- `json/parseJsonc` — Parse JSON that may contain `//` and `/* */` comments and trailing commas, as found in tsconfig.json, .eslintrc, and VS Code settings.json.
- `json/validateSchema` — Validate a JSON value `input` against a JSON Schema `schema` (draft 2020-12 by default; draft-07/04 and 2019-09 are honored via `$schema`).

#### math (6) — Rounding, clamping, percentages, statistics, base and byte formatting

- `math/round` — Round a number to `decimals` places, half away from zero.
- `math/clamp` — Constrain a number to the inclusive range [min, max].
- `math/percentage` — Express `value` as a percentage of `total`, rounded to `decimals` places.
- `math/stats` — Descriptive statistics for a list of numbers: count, sum, min, max, mean, median, population variance and standard deviation.
- `math/baseConvert` — Convert an integer between bases 2–36 (binary, octal, decimal, hex, …).
- `math/formatBytes` — Format a byte count for humans, e.g.

#### paths (6) — POSIX path parsing, joining, normalizing, and containment checks

- `paths/parse` — Split a POSIX path into dir, base, name, ext, root, isAbsolute and its segments.
- `paths/join` — Join path segments with "/" and normalize the result (collapses "." and ".." and repeated slashes).
- `paths/normalize` — Resolve "." and ".." segments and collapse repeated slashes without touching the filesystem.
- `paths/relative` — Compute the relative path from one location to another, e.g.
- `paths/resolve` — Resolve a path against an explicit absolute base directory (never process.cwd()).
- `paths/isInside` — Check whether a path stays within a directory after normalization, catching "../" escapes.

#### regex (5) — Regular expression test, match, replace, split, and escape

- `regex/test` — Test whether a regular expression matches anywhere in the text.
- `regex/match` — Find every match of a pattern in the text (always global).
- `regex/replace` — Replace every match (or only the first with all=false) using String.replace substitution syntax: $1, $<name>, $& for the whole match, $$ for a literal dollar.
- `regex/escape` — Escape a literal string so it can be embedded in a pattern and match itself exactly (backslashes the special characters).
- `regex/split` — Split text by a pattern into an array.

#### semver (7) — Semantic version parsing, comparison, ranges, and bumping

- `semver/parse` — Split a semantic version like `1.2.3-beta.1+build.5` into major, minor, patch, prerelease identifiers, and build metadata.
- `semver/coerce` — Pull a full semantic version out of loose text: `v1.2` → `1.2.0`, `node 18.19` → `18.19.0`, `1.2.3.4` → `1.2.3`.
- `semver/compare` — Compare two semantic versions: -1 if `a` is lower than `b`, 0 if equal, 1 if higher.
- `semver/satisfies` — Whether `version` falls inside a node-semver `range` such as `^1.2.0`, `~1.2`, `>=1.0.0 <2`, or `1.x`.
- `semver/inc` — Bump a semantic version by `release` (major, minor, patch, premajor, preminor, prepatch, prerelease).
- `semver/sort` — Sort a list of semantic versions numerically (1.10.0 after 1.9.0, prereleases before their release), ascending by default or `direction: "desc"`.
- `semver/maxSatisfying` — Pick the highest version from `versions` that satisfies `range` (what a package manager would resolve), or null if none does.

#### strings (17) — Case conversion, slugs, truncation, wrapping, HTML escaping, similarity

- `strings/toCamelCase` — Convert any-cased text to camelCase.
- `strings/toPascalCase` — Convert any-cased text to PascalCase.
- `strings/toKebabCase` — Convert any-cased text to kebab-case.
- `strings/toSnakeCase` — Convert any-cased text to snake_case.
- `strings/toConstantCase` — Convert any-cased text to CONSTANT_CASE (upper snake case).
- `strings/toTitleCase` — Convert any-cased text to Title Case (every word capitalized).
- `strings/toSentenceCase` — Convert any-cased text to Sentence case (first word capitalized).
- `strings/slugify` — Convert text to a URL-safe lowercase slug: ASCII letters and digits separated by single hyphens.
- `strings/truncate` — Shorten text to at most `length` characters, ending with `suffix` when cut.
- `strings/wordCount` — Count words, characters, and lines in text, like a deterministic `wc`.
- `strings/escapeHtml` — Escape the five HTML-significant characters (& < > " ') as entities.
- `strings/unescapeHtml` — Decode HTML entities: common named entities (&amp; &lt; &nbsp; &copy; &mdash; …) plus any numeric (&#65;) or hex (&#x41;) reference.
- `strings/similarity` — Compare two strings: Levenshtein edit distance and a normalized similarity score from 0 (nothing shared) to 1 (identical).
- `strings/wrap` — Word-wrap text so no line exceeds `width` characters.
- `strings/dedent` — Remove the common leading indentation from every line (blank lines are ignored when measuring).
- `strings/indent` — Prefix every non-empty line with `prefix` (default two spaces).
- `strings/diff` — Unified diff of two texts, line by line, like `diff -u`.

#### urls (5) — URL parsing, building, query editing, resolving, and normalizing

- `urls/parse` — Break an absolute URL into protocol, credentials, host, port, path, decoded query object, hash and origin.
- `urls/build` — Assemble a URL from hostname, protocol, port, pathname, query object and hash, percent-encoding as needed.
- `urls/setQuery` — Set or replace query parameters on a URL, keeping the others.
- `urls/resolve` — Resolve a relative URL (path, query, fragment or protocol-relative) against a base URL, the way a browser resolves a link.
- `urls/normalize` — Canonicalize a URL for comparison or caching: lowercase scheme and host, drop default ports and empty query/fragment, resolve dot segments, sort query parameters.

#### validation (9) — Boolean checks for emails, URLs, UUIDs, JSON, dates, IPs, semver

- `validation/isEmail` — Check whether text is a syntactically valid email address (RFC 5322 shape; does not verify the mailbox exists).
- `validation/isUrl` — Check whether text is a valid absolute URL with a host (http/https/ftp by default).
- `validation/isUuid` — Check whether text is a UUID (any version, hyphenated, case-insensitive).
- `validation/isJson` — Check whether text parses as JSON (any JSON value, not only objects).
- `validation/isIsoDate` — Check whether text is a valid ISO 8601 date or date-time (strict: rejects impossible dates such as Feb 30).
- `validation/isHexColor` — Check whether text is a CSS hex color: #rgb, #rgba, #rrggbb, or #rrggbbaa.
- `validation/isSemver` — Check whether text is a valid semantic version (e.g.
- `validation/isBase64` — Check whether text is standard base64 (A–Z a–z 0–9 + / with = padding, length a multiple of 4).
- `validation/isIpAddress` — Detect whether text is an IP address and which version.

## Design

- **Deterministic.** No I/O, network, clock, randomness, or host-locale dependence. Dates are UTC unless a zone is given explicitly. Same input, same output, on every machine.
- **One definition per function.** Name, description, Zod schema, examples, and implementation live together in `src/functions/<category>.ts`. The MCP tool list, CLI flags, help text, JSON Schema, and discovery metadata are all derived from it.
- **Examples are tests.** Every documented example is executed by the test suite and must reproduce exactly.
- **Errors are values.** Implementations return a value or throw `UtilityError(code, message)`; one wrapper turns that into the envelope for both surfaces.
- **Fast.** Every function targets under 10 ms.

## Development

```bash
npm run dev          # hot reload
npm test             # vitest, run once
npm run test:watch
npm run typecheck    # src and tests
npm run lint
npm run format
npm run check        # typecheck + lint + format:check + test
npm run build        # compile to dist/
```

Project layout:

```
src/
├── index.ts          # entry: argv → CLI, piped stdin → MCP, TTY → help
├── cli.ts            # CLI adapter
├── server.ts         # MCP adapter
├── core/
│   ├── define.ts     # defineFunction(), execute()
│   ├── responses.ts  # envelope types, UtilityError, error codes
│   ├── registry.ts   # derived registry: lookup, search, categories, metadata
│   └── compose.ts    # batch and pipe
└── functions/        # one file per category: schema + implementation + examples
tests/unit/           # registry contract, server, cli, and one suite per category
```

To add a function, see [docs/adding_functions.md](docs/adding_functions.md). Architecture notes are in [docs/architecture.md](docs/architecture.md) and testing patterns in [docs/testing.md](docs/testing.md).

## License

MIT
