/**
 * math/* — numeric helpers with well-defined rounding and no floating-point
 * surprises on the common cases (1.005 → 1.01).
 */

import { z } from "zod";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

const finite = (description: string) => z.number().finite().describe(description);
const decimalsField = z.number().int().min(0).max(15);

/**
 * Round half away from zero to `decimals` places. Uses exponent shifting
 * rather than multiplication so 1.005 rounds to 1.01, and normalizes -0 to 0.
 */
export function round(value: number, decimals = 0): number {
  const abs = Math.abs(value);
  const shifted = Math.round(Number(`${abs}e${decimals}`));
  const result = Number(`${shifted}e-${decimals}`);
  return (value < 0 ? -result : result) + 0;
}

export function clamp(value: number, min: number, max: number): number {
  if (min > max) fail("INVALID_RANGE", `min (${min}) cannot be greater than max (${max})`);
  return Math.min(Math.max(value, min), max);
}

export function percentage(value: number, total: number, decimals = 2): number {
  if (total === 0) fail("DIVISION_BY_ZERO", "total cannot be zero");
  return round((value / total) * 100, decimals);
}

export interface Stats {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Population variance and standard deviation (divide by n). */
  variance: number;
  stddev: number;
}

export function stats(values: number[]): Stats {
  if (values.length === 0) fail("EMPTY_INPUT", "values must contain at least one number");
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  return {
    count,
    sum,
    min: sorted[0],
    max: sorted[count - 1],
    mean,
    median,
    variance,
    stddev: Math.sqrt(variance),
  };
}

/** Convert an integer string between bases 2–36. Accepts an optional leading "-". */
export function baseConvert(value: string, fromBase: number, toBase: number): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const valid = new RegExp(`^[0-9a-z]+$`, "i").test(digits);
  if (!valid || digits === "")
    fail("INVALID_NUMBER", `"${value}" is not a base-${fromBase} integer`);
  let n = 0n;
  const big = BigInt(fromBase);
  for (const ch of digits.toLowerCase()) {
    const d = parseInt(ch, 36);
    if (Number.isNaN(d) || d >= fromBase)
      fail("INVALID_NUMBER", `"${value}" is not a base-${fromBase} integer`);
    n = n * big + BigInt(d);
  }
  return (negative ? "-" : "") + n.toString(toBase);
}

const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
const DECIMAL_UNITS = ["B", "kB", "MB", "GB", "TB", "PB", "EB"];

/** Human-readable byte size, e.g. 1536 → "1.5 KiB" (binary) or "1.54 kB" (decimal). */
export function formatBytes(bytes: number, base: 1024 | 1000 = 1024, decimals = 2): string {
  const units = base === 1024 ? BINARY_UNITS : DECIMAL_UNITS;
  const abs = Math.abs(bytes);
  if (abs < base) return `${bytes} B`;
  const exponent = Math.min(Math.floor(Math.log(abs) / Math.log(base)), units.length - 1);
  return `${round(bytes / base ** exponent, decimals)} ${units[exponent]}`;
}

export const functions = [
  defineFunction({
    name: "math/round",
    description:
      "Round a number to `decimals` places, half away from zero. Correct on the classic floating-point traps (1.005 → 1.01, 2.5 → 3, -2.5 → -3).",
    input: z.object({
      value: finite("Number to round"),
      decimals: decimalsField.default(0).describe("Decimal places to keep (0–15)"),
    }),
    returns: "rounded number",
    tags: ["math", "round", "decimal", "precision"],
    examples: [
      { description: "2 decimals", input: { value: 3.14159, decimals: 2 }, output: 3.14 },
      { description: "Floating-point trap", input: { value: 1.005, decimals: 2 }, output: 1.01 },
      { description: "Half away from zero", input: { value: -2.5 }, output: -3 },
    ],
    run: (a) => round(a.value, a.decimals),
  }),
  defineFunction({
    name: "math/clamp",
    description: "Constrain a number to the inclusive range [min, max].",
    input: z.object({
      value: finite("Number to clamp"),
      min: finite("Lower bound"),
      max: finite("Upper bound"),
    }),
    returns: "value limited to the range",
    tags: ["math", "clamp", "limit", "constrain", "range"],
    examples: [
      { description: "Above max", input: { value: 100, min: 0, max: 50 }, output: 50 },
      { description: "Inside", input: { value: 25, min: 0, max: 50 }, output: 25 },
    ],
    run: (a) => clamp(a.value, a.min, a.max),
  }),
  defineFunction({
    name: "math/percentage",
    description: "Express `value` as a percentage of `total`, rounded to `decimals` places.",
    input: z.object({
      value: finite("Part"),
      total: finite("Whole (cannot be zero)"),
      decimals: decimalsField.default(2).describe("Decimal places to keep (0–15)"),
    }),
    returns: "percentage as a number (25 means 25%)",
    tags: ["math", "percentage", "ratio", "fraction"],
    examples: [
      { description: "Quarter", input: { value: 25, total: 100 }, output: 25 },
      { description: "Third", input: { value: 1, total: 3 }, output: 33.33 },
    ],
    run: (a) => percentage(a.value, a.total, a.decimals),
  }),
  defineFunction({
    name: "math/stats",
    description:
      "Descriptive statistics for a list of numbers: count, sum, min, max, mean, median, population variance and standard deviation.",
    input: z.object({ values: z.array(finite("")).min(1).describe("Numbers to summarize") }),
    returns: "object with count, sum, min, max, mean, median, variance, stddev",
    tags: ["math", "statistics", "mean", "median", "average", "sum", "stddev"],
    examples: [
      {
        description: "Five values",
        input: { values: [2, 4, 4, 4, 5, 5, 7, 9] },
        output: { count: 8, sum: 40, min: 2, max: 9, mean: 5, median: 4.5, variance: 4, stddev: 2 },
      },
    ],
    run: (a) => stats(a.values),
  }),
  defineFunction({
    name: "math/baseConvert",
    description:
      "Convert an integer between bases 2–36 (binary, octal, decimal, hex, …). Arbitrary size; digits above 9 are letters.",
    input: z.object({
      value: z.string().describe("Integer digits in the source base, optional leading -"),
      fromBase: z.number().int().min(2).max(36).describe("Source base"),
      toBase: z.number().int().min(2).max(36).describe("Target base"),
    }),
    returns: "lowercase digit string in the target base",
    tags: ["math", "base", "radix", "hex", "binary", "octal", "convert"],
    examples: [
      {
        description: "Decimal to hex",
        input: { value: "255", fromBase: 10, toBase: 16 },
        output: "ff",
      },
      {
        description: "Binary to decimal",
        input: { value: "1010", fromBase: 2, toBase: 10 },
        output: "10",
      },
    ],
    run: (a) => baseConvert(a.value, a.fromBase, a.toBase),
  }),
  defineFunction({
    name: "math/formatBytes",
    description:
      'Format a byte count for humans, e.g. 1536 → "1.5 KiB". Base 1024 gives KiB/MiB (IEC); base 1000 gives kB/MB (SI).',
    input: z.object({
      bytes: finite("Number of bytes"),
      base: z
        .union([z.literal(1024), z.literal(1000)])
        .default(1024)
        .describe("1024 for KiB/MiB, 1000 for kB/MB"),
      decimals: decimalsField.default(2).describe("Decimal places to keep"),
    }),
    returns: 'string such as "1.5 KiB"',
    tags: ["math", "bytes", "size", "format", "human"],
    examples: [
      { description: "Binary", input: { bytes: 1536 }, output: "1.5 KiB" },
      { description: "Decimal", input: { bytes: 1500000, base: 1000 }, output: "1.5 MB" },
    ],
    run: (a) => formatBytes(a.bytes, a.base, a.decimals),
  }),
];
