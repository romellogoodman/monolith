/**
 * paths/* — pure string manipulation of file paths.
 *
 * Every function uses POSIX semantics (`node:path.posix`): "/" is the only
 * separator, there are no drive letters, and results are identical on every
 * OS. Nothing here touches the filesystem or process.cwd().
 */

import { posix } from "node:path";
import { z } from "zod";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

export interface ParsedPath {
  /** Directory portion, e.g. "/home/user" (or "" when there is none). */
  dir: string;
  /** Last portion including extension, e.g. "file.txt". */
  base: string;
  /** Base name without its extension, e.g. "file". */
  name: string;
  /** Extension including the dot, e.g. ".txt" (or ""). */
  ext: string;
  /** "/" for absolute paths, otherwise "". */
  root: string;
  isAbsolute: boolean;
  /** Non-empty path components in order, e.g. ["home", "user", "file.txt"]. */
  segments: string[];
}

/** Path components as written; empty segments from repeated or trailing slashes are dropped. */
export function parse(path: string): ParsedPath {
  const { dir, base, name, ext, root } = posix.parse(path);
  return {
    dir,
    base,
    name,
    ext,
    root,
    isAbsolute: posix.isAbsolute(path),
    segments: path.split("/").filter((s) => s !== ""),
  };
}

/** Join segments with "/" and normalize the result. */
export function join(segments: string[]): string {
  return posix.join(...segments);
}

/** Collapse "." and ".." segments and repeated slashes. A trailing slash is preserved. */
export function normalize(path: string): string {
  return posix.normalize(path);
}

/**
 * Normalized path segments, dropping "" and ".". After normalization ".." can
 * only appear at the front of a relative path, which the callers rely on.
 */
function segmentsOf(path: string): string[] {
  return posix
    .normalize(path)
    .split("/")
    .filter((s) => s !== "" && s !== ".");
}

/**
 * Relative path that leads from `from` to `to`. Relative inputs are treated
 * as relative to the same (unspecified) directory, so ".." segments that
 * would escape it are dropped rather than resolved against process.cwd().
 */
export function relative(from: string, to: string): string {
  const anchor = (p: string) => (posix.isAbsolute(p) ? posix.normalize(p) : posix.join("/", p));
  return posix.relative(anchor(from), anchor(to));
}

/** Resolve `path` against the absolute directory `base`; an absolute `path` is only normalized. */
export function resolve(path: string, base: string): string {
  if (!posix.isAbsolute(base)) fail("INVALID_BASE", `base must be an absolute path, got "${base}"`);
  return posix.resolve(base, path);
}

/**
 * Whether `path` is `directory` or lies beneath it after normalization, so
 * "../" escapes are caught. Both paths must be absolute, or both relative
 * (then they are taken relative to the same directory).
 */
export function isInside(path: string, directory: string): boolean {
  if (posix.isAbsolute(path) !== posix.isAbsolute(directory)) {
    fail("MIXED_PATH_TYPES", "path and directory must both be absolute or both be relative");
  }
  const target = segmentsOf(path);
  const parent = segmentsOf(directory);
  if (target.length < parent.length) return false;
  for (let i = 0; i < parent.length; i++) if (target[i] !== parent[i]) return false;
  // A leftover ".." means `path` climbs above `directory` (only possible for relative inputs).
  return target[parent.length] !== "..";
}

const pathField = (description: string) => z.string().describe(description);

export const functions = [
  defineFunction({
    name: "paths/parse",
    description:
      "Split a POSIX path into dir, base, name, ext, root, isAbsolute and its segments. Pure string work: nothing is read from disk.",
    input: z.object({ path: pathField("Path to parse, e.g. /home/user/file.txt") }),
    returns: "object with dir, base, name, ext, root, isAbsolute, segments",
    tags: ["paths", "parse", "filename", "extension", "dirname", "basename"],
    examples: [
      {
        description: "Absolute file path",
        input: { path: "/home/user/docs/report.final.pdf" },
        output: {
          dir: "/home/user/docs",
          base: "report.final.pdf",
          name: "report.final",
          ext: ".pdf",
          root: "/",
          isAbsolute: true,
          segments: ["home", "user", "docs", "report.final.pdf"],
        },
      },
      {
        description: "Relative dotfile has no extension",
        input: { path: "config/.env" },
        output: {
          dir: "config",
          base: ".env",
          name: ".env",
          ext: "",
          root: "",
          isAbsolute: false,
          segments: ["config", ".env"],
        },
      },
    ],
    run: (a) => parse(a.path),
  }),
  defineFunction({
    name: "paths/join",
    description:
      'Join path segments with "/" and normalize the result (collapses "." and ".." and repeated slashes). POSIX semantics on every OS.',
    input: z.object({ segments: z.array(z.string()).min(1).describe("Path segments to join") }),
    returns: "joined, normalized path",
    tags: ["paths", "join", "concat", "combine"],
    examples: [
      {
        description: "Mixed separators and dot segments",
        input: { segments: ["/var", "www/", "./site", "../app", "index.html"] },
        output: "/var/www/app/index.html",
      },
      {
        description: "Relative segments",
        input: { segments: ["src", "utils"] },
        output: "src/utils",
      },
    ],
    run: (a) => join(a.segments),
  }),
  defineFunction({
    name: "paths/normalize",
    description:
      'Resolve "." and ".." segments and collapse repeated slashes without touching the filesystem. Leading ".." in a relative path is kept; in an absolute path it is dropped.',
    input: z.object({ path: pathField("Path to normalize") }),
    returns: "normalized path",
    tags: ["paths", "normalize", "clean", "dot-segments"],
    examples: [
      {
        description: "Absolute path with noise",
        input: { path: "/a//b/./c/../d/" },
        output: "/a/b/d/",
      },
      { description: "Leading .. survives", input: { path: "../x/./y/../z" }, output: "../x/z" },
    ],
    run: (a) => normalize(a.path),
  }),
  defineFunction({
    name: "paths/relative",
    description:
      "Compute the relative path from one location to another, e.g. from /a/b to /a/c gives ../c. Both paths should be absolute, or both relative to the same directory.",
    input: z.object({
      from: pathField("Starting directory"),
      to: pathField("Destination path"),
    }),
    returns: 'relative path string ("" when both point to the same place)',
    tags: ["paths", "relative", "import", "link"],
    examples: [
      {
        description: "Sibling directory",
        input: { from: "/src/components/button", to: "/src/utils/format.ts" },
        output: "../../utils/format.ts",
      },
      {
        description: "Descendant",
        input: { from: "/app", to: "/app/lib/x.js" },
        output: "lib/x.js",
      },
    ],
    run: (a) => relative(a.from, a.to),
  }),
  defineFunction({
    name: "paths/resolve",
    description:
      "Resolve a path against an explicit absolute base directory (never process.cwd()). An already-absolute path is returned normalized.",
    input: z.object({
      path: pathField("Path to resolve; relative paths are joined onto base"),
      base: pathField("Absolute directory to resolve against"),
    }),
    returns: "absolute, normalized path",
    tags: ["paths", "resolve", "absolute", "cwd"],
    examples: [
      {
        description: "Relative path against a base",
        input: { path: "../shared/config.json", base: "/srv/app/current" },
        output: "/srv/app/shared/config.json",
      },
      {
        description: "Absolute path ignores base",
        input: { path: "/etc/hosts", base: "/srv/app" },
        output: "/etc/hosts",
      },
    ],
    run: (a) => resolve(a.path, a.base),
  }),
  defineFunction({
    name: "paths/isInside",
    description:
      'Check whether a path stays within a directory after normalization, catching "../" escapes. A directory counts as inside itself. Both inputs must be absolute, or both relative.',
    input: z.object({
      path: pathField("Path to test"),
      directory: pathField("Directory that should contain it"),
    }),
    returns: "true when path is the directory or beneath it",
    tags: ["paths", "inside", "contains", "traversal", "security", "sandbox"],
    examples: [
      {
        description: "Nested file",
        input: { path: "/data/uploads/2024/photo.jpg", directory: "/data/uploads" },
        output: true,
      },
      {
        description: "Traversal escape",
        input: { path: "/data/uploads/../../etc/passwd", directory: "/data/uploads" },
        output: false,
      },
      {
        description: "Prefix that is not a parent",
        input: { path: "/data/uploads-old/a", directory: "/data/uploads" },
        output: false,
      },
    ],
    run: (a) => isInside(a.path, a.directory),
  }),
];
