/**
 * semver/* — parse, compare, and manipulate Semantic Versioning 2.0.0 strings
 * and node-semver ranges (^1.2.0, ~1.2, >=1 <2, 1.x). Strict by default: a
 * leading "v" is tolerated but partial versions like "1.2" are not (use coerce).
 */

import { z } from "zod";
import semver from "semver";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

const versionField = (description: string) => z.string().min(1).describe(description);
const rangeField = z.string().min(1).describe('Range, e.g. "^1.2.0", "~1.2", ">=1.0.0 <2", "1.x"');

const RELEASE_TYPES = [
  "major",
  "minor",
  "patch",
  "premajor",
  "preminor",
  "prepatch",
  "prerelease",
] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers; numeric ones are numbers. */
  prerelease: Array<string | number>;
  /** Build metadata identifiers (ignored in comparisons). */
  build: string[];
  /** Normalized version without build metadata, e.g. "1.2.3-beta.1". */
  version: string;
}

const invalidVersion = (version: string): never =>
  fail("INVALID_VERSION", `"${version}" is not a valid semantic version`, { version });

const invalidRange = (range: string): never =>
  fail("INVALID_RANGE", `"${range}" is not a valid semver range`, { range });

function ensureRange(range: string): string {
  const valid = semver.validRange(range);
  return valid === null ? invalidRange(range) : valid;
}

/** Split a version into its numbered parts. Rejects anything that is not full SemVer 2.0.0. */
export function parse(version: string): ParsedVersion {
  const v = semver.parse(version);
  if (v === null) return invalidVersion(version);
  return {
    major: v.major,
    minor: v.minor,
    patch: v.patch,
    prerelease: [...v.prerelease],
    build: [...v.build],
    version: v.version,
  };
}

/** Best-effort extraction of a version from loose text: "v1.2" → "1.2.0", "node 18.19" → "18.19.0". */
export function coerce(input: string): string {
  const v = semver.coerce(input);
  return v === null ? invalidVersion(input) : v.version;
}

/** -1 if a < b, 0 if equal (build metadata ignored), 1 if a > b. */
export function compare(a: string, b: string): -1 | 0 | 1 {
  if (!semver.valid(a)) invalidVersion(a);
  if (!semver.valid(b)) invalidVersion(b);
  return semver.compare(a, b);
}

/** Whether `version` falls inside `range`. Prereleases only match ranges that mention a prerelease on the same tuple. */
export function satisfies(version: string, range: string): boolean {
  ensureRange(range);
  if (!semver.valid(version)) invalidVersion(version);
  return semver.satisfies(version, range);
}

/** Bump a version. `preid` names the prerelease tag for pre* releases (default "0" numbering). */
export function inc(version: string, release: ReleaseType, preid?: string): string {
  const result =
    preid === undefined ? semver.inc(version, release) : semver.inc(version, release, preid);
  return result === null ? invalidVersion(version) : result;
}

/** Sort version strings ascending (or descending). Every entry must be valid. */
export function sort(versions: string[], direction: "asc" | "desc" = "asc"): string[] {
  const invalid = versions.filter((v) => !semver.valid(v));
  if (invalid.length > 0) {
    fail(
      "INVALID_VERSION",
      `${invalid.length} entr${invalid.length === 1 ? "y is" : "ies are"} not valid semantic versions`,
      {
        invalid,
      }
    );
  }
  const sorted = [...versions].sort((a, b) => semver.compareBuild(a, b));
  return direction === "desc" ? sorted.reverse() : sorted;
}

/** Highest version in the list that satisfies the range, or null. */
export function maxSatisfying(versions: string[], range: string): string | null {
  ensureRange(range);
  const invalid = versions.filter((v) => !semver.valid(v));
  if (invalid.length > 0) {
    fail(
      "INVALID_VERSION",
      `${invalid.length} entr${invalid.length === 1 ? "y is" : "ies are"} not valid semantic versions`,
      {
        invalid,
      }
    );
  }
  return semver.maxSatisfying(versions, range);
}

export const functions = [
  defineFunction({
    name: "semver/parse",
    description:
      "Split a semantic version like `1.2.3-beta.1+build.5` into major, minor, patch, prerelease identifiers, and build metadata. Strict SemVer 2.0.0 (a leading v is allowed).",
    input: z.object({ version: versionField("Version string to parse") }),
    returns: "{ major, minor, patch, prerelease, build, version }",
    tags: ["semver", "version", "parse", "major", "minor", "patch", "prerelease"],
    examples: [
      {
        description: "Prerelease with build metadata",
        input: { version: "v1.2.3-beta.1+build.5" },
        output: {
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: ["beta", 1],
          build: ["build", "5"],
          version: "1.2.3-beta.1",
        },
      },
      {
        description: "Plain release",
        input: { version: "2.0.0" },
        output: { major: 2, minor: 0, patch: 0, prerelease: [], build: [], version: "2.0.0" },
      },
    ],
    run: (a) => parse(a.version),
  }),
  defineFunction({
    name: "semver/coerce",
    description:
      "Pull a full semantic version out of loose text: `v1.2` → `1.2.0`, `node 18.19` → `18.19.0`, `1.2.3.4` → `1.2.3`. Use when input may be incomplete or wrapped in other words.",
    input: z.object({ input: z.string().min(1).describe("Loose version text") }),
    returns: "normalized X.Y.Z version string",
    tags: ["semver", "version", "coerce", "normalize", "clean"],
    examples: [
      { description: "Partial with v prefix", input: { input: "v1.2" }, output: "1.2.0" },
      { description: "Embedded in text", input: { input: "node 18.19" }, output: "18.19.0" },
    ],
    run: (a) => coerce(a.input),
  }),
  defineFunction({
    name: "semver/compare",
    description:
      "Compare two semantic versions: -1 if `a` is lower than `b`, 0 if equal, 1 if higher. Prereleases sort before their release (1.0.0-alpha < 1.0.0); build metadata is ignored.",
    input: z.object({
      a: versionField("First version"),
      b: versionField("Second version"),
    }),
    returns: "-1, 0, or 1",
    tags: ["semver", "version", "compare", "order", "greater", "less"],
    examples: [
      { description: "Prerelease is lower", input: { a: "1.0.0-alpha", b: "1.0.0" }, output: -1 },
      { description: "Minor bump is higher", input: { a: "1.10.0", b: "1.9.0" }, output: 1 },
      { description: "Build metadata ignored", input: { a: "1.0.0+a", b: "1.0.0+b" }, output: 0 },
    ],
    run: (a) => compare(a.a, a.b),
  }),
  defineFunction({
    name: "semver/satisfies",
    description:
      "Whether `version` falls inside a node-semver `range` such as `^1.2.0`, `~1.2`, `>=1.0.0 <2`, or `1.x`. Use to check a dependency constraint against an installed version.",
    input: z.object({
      version: versionField("Version to test"),
      range: rangeField,
    }),
    returns: "true when the version is in range",
    tags: ["semver", "version", "range", "satisfies", "match", "constraint"],
    examples: [
      { description: "Caret range", input: { version: "1.4.2", range: "^1.2.0" }, output: true },
      { description: "Outside", input: { version: "2.0.0", range: ">=1.0.0 <2" }, output: false },
    ],
    run: (a) => satisfies(a.version, a.range),
  }),
  defineFunction({
    name: "semver/inc",
    description:
      "Bump a semantic version by `release` (major, minor, patch, premajor, preminor, prepatch, prerelease). `preid` names the prerelease tag, e.g. beta → 1.3.0-beta.0.",
    input: z.object({
      version: versionField("Version to bump"),
      release: z.enum(RELEASE_TYPES).describe("Which part to increment"),
      preid: z.string().min(1).optional().describe('Prerelease identifier such as "alpha" or "rc"'),
    }),
    returns: "the bumped version string",
    tags: ["semver", "version", "bump", "increment", "release", "prerelease"],
    examples: [
      { description: "Patch", input: { version: "1.2.3", release: "patch" }, output: "1.2.4" },
      {
        description: "Preminor with tag",
        input: { version: "1.2.3", release: "preminor", preid: "beta" },
        output: "1.3.0-beta.0",
      },
      {
        description: "Next prerelease",
        input: { version: "1.3.0-beta.0", release: "prerelease" },
        output: "1.3.0-beta.1",
      },
    ],
    run: (a) => inc(a.version, a.release, a.preid),
  }),
  defineFunction({
    name: "semver/sort",
    description:
      'Sort a list of semantic versions numerically (1.10.0 after 1.9.0, prereleases before their release), ascending by default or `direction: "desc"`.',
    input: z.object({
      versions: z.array(versionField("")).describe("Version strings to sort"),
      direction: z.enum(["asc", "desc"]).default("asc").describe("Sort order"),
    }),
    returns: "the versions in sorted order",
    tags: ["semver", "version", "sort", "order", "list"],
    examples: [
      {
        description: "Ascending",
        input: { versions: ["1.10.0", "1.2.0", "1.0.0-alpha", "1.0.0"] },
        output: ["1.0.0-alpha", "1.0.0", "1.2.0", "1.10.0"],
      },
      {
        description: "Descending",
        input: { versions: ["1.0.0", "2.0.0"], direction: "desc" },
        output: ["2.0.0", "1.0.0"],
      },
    ],
    run: (a) => sort(a.versions, a.direction),
  }),
  defineFunction({
    name: "semver/maxSatisfying",
    description:
      "Pick the highest version from `versions` that satisfies `range` (what a package manager would resolve), or null if none does.",
    input: z.object({
      versions: z.array(versionField("")).describe("Candidate version strings"),
      range: rangeField,
    }),
    returns: "the highest matching version string, or null",
    tags: ["semver", "version", "range", "resolve", "max", "highest"],
    examples: [
      {
        description: "Caret resolution",
        input: { versions: ["1.2.0", "1.9.3", "2.0.0", "1.9.4-rc.1"], range: "^1.2.0" },
        output: "1.9.3",
      },
      { description: "No match", input: { versions: ["1.0.0"], range: ">=2" }, output: null },
    ],
    run: (a) => maxSatisfying(a.versions, a.range),
  }),
];
