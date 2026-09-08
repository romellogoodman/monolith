/**
 * color/* — parse, convert, compare and adjust sRGB colors. Hand-rolled:
 * accepts hex, rgb()/rgba(), hsl()/hsla() and a table of CSS named colors,
 * and always reports the same { hex, hexAlpha, rgb, hsl, css } shape.
 */

import { z } from "zod";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

/** Unquantized working color: r, g, b in 0–255 (may be fractional), a in 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Hsla {
  /** Hue in degrees, 0–360. */
  h: number;
  /** Saturation percentage, 0–100. */
  s: number;
  /** Lightness percentage, 0–100. */
  l: number;
  a: number;
}

export interface Color {
  /** Opaque 6-digit hex, e.g. "#ff8800". */
  hex: string;
  /** 8-digit hex when the color is translucent, otherwise null. */
  hexAlpha: string | null;
  /** Integer channels 0–255 plus alpha 0–1 (3 decimals). */
  rgb: Rgba;
  /** Hue 0–360, saturation and lightness 0–100 (1 decimal), alpha 0–1. */
  hsl: Hsla;
  css: { rgb: string; hsl: string };
}

/** CSS named colors: the 16 basic colors plus common extended ones. */
export const NAMED_COLORS: Record<string, string> = {
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  beige: "#f5f5dc",
  black: "#000000",
  blue: "#0000ff",
  brown: "#a52a2a",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkorange: "#ff8c00",
  darkred: "#8b0000",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  gold: "#ffd700",
  gray: "#808080",
  green: "#008000",
  grey: "#808080",
  hotpink: "#ff69b4",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lightblue: "#add8e6",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  magenta: "#ff00ff",
  maroon: "#800000",
  midnightblue: "#191970",
  navy: "#000080",
  olive: "#808000",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  royalblue: "#4169e1",
  salmon: "#fa8072",
  seagreen: "#2e8b57",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  tomato: "#ff6347",
  transparent: "#00000000",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f + 0;
};

function invalid(input: string): never {
  return fail(
    "INVALID_COLOR",
    `"${input}" is not a recognized color; use #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla() or a CSS color name`
  );
}

function parseHex(hex: string): Rgba | null {
  const digits = hex.slice(1);
  if (!/^[0-9a-f]+$/i.test(digits)) return null;
  let full: string;
  if (digits.length === 3 || digits.length === 4) full = [...digits].map((d) => d + d).join("");
  else if (digits.length === 6 || digits.length === 8) full = digits;
  else return null;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

/** Parse a CSS number with an optional unit; returns null when malformed. */
function num(token: string, unit: "%" | "deg" | ""): number | null {
  let body = token;
  if (unit && body.toLowerCase().endsWith(unit)) body = body.slice(0, -unit.length);
  else if (unit === "%") return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(body)) return null;
  return Number(body);
}

function parseAlpha(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const value = token.endsWith("%") ? num(token, "%") : num(token, "");
  if (value === null) return null;
  return clamp(token.endsWith("%") ? value / 100 : value, 0, 1);
}

function parseFunctional(fn: string, body: string): Rgba | null {
  // Accept both legacy "r, g, b, a" and modern "r g b / a" argument syntax.
  const tokens = body.split(/\s*[,/]\s*|\s+/).filter((t) => t !== "");
  if (tokens.length < 3 || tokens.length > 4) return null;
  const a = parseAlpha(tokens[3]);
  if (a === null) return null;
  if (fn === "rgb" || fn === "rgba") {
    const channel = (t: string) => {
      const v = t.endsWith("%") ? (num(t, "%") ?? NaN) * 2.55 : num(t, "");
      return v === null || Number.isNaN(v) ? null : clamp(v, 0, 255);
    };
    const [r, g, b] = tokens.slice(0, 3).map(channel);
    if (r === null || g === null || b === null) return null;
    return { r, g, b, a };
  }
  const h = num(tokens[0], tokens[0].toLowerCase().endsWith("deg") ? "deg" : "");
  const s = num(tokens[1], "%");
  const l = num(tokens[2], "%");
  if (h === null || s === null || l === null) return null;
  return hslToRgb({ h, s: clamp(s, 0, 100), l: clamp(l, 0, 100), a });
}

/** Parse any accepted color notation into an unquantized Rgba, or throw INVALID_COLOR. */
export function parseColor(input: string): Rgba {
  const text = input.trim();
  const lower = text.toLowerCase();
  let result: Rgba | null = null;
  if (text.startsWith("#")) result = parseHex(text);
  else if (lower in NAMED_COLORS) result = parseHex(NAMED_COLORS[lower]);
  else {
    const m = /^(rgba?|hsla?)\((.*)\)$/i.exec(text);
    if (m) result = parseFunctional(m[1].toLowerCase(), m[2]);
  }
  return result ?? invalid(input);
}

export function hslToRgb({ h, s, l, a }: Hsla): Rgba {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor(hue / 60);
  const [r1, g1, b1] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector % 6];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255, a };
}

export function rgbToHsl({ r, g, b, a }: Rgba): Hsla {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100, a };
}

const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, "0");

/** Quantize a working color into the shared output shape. */
export function toColor(color: Rgba): Color {
  // Round away float noise (0.1 * 255 = 25.4999…) before quantizing to 8 bits.
  const channel = (v: number) => Math.round(round(clamp(v, 0, 255), 6));
  const rgb: Rgba = {
    r: channel(color.r),
    g: channel(color.g),
    b: channel(color.b),
    a: clamp(color.a, 0, 1),
  };
  const raw = rgbToHsl(rgb);
  const hsl: Hsla = {
    h: round(raw.h, 1) % 360,
    s: round(raw.s, 1),
    l: round(raw.l, 1),
    a: round(rgb.a, 3),
  };
  const hex = `#${hex2(rgb.r)}${hex2(rgb.g)}${hex2(rgb.b)}`;
  const opaque = rgb.a === 1;
  const alpha = round(rgb.a, 3);
  return {
    hex,
    hexAlpha: opaque ? null : `${hex}${hex2(rgb.a * 255)}`,
    rgb: { ...rgb, a: alpha },
    hsl,
    css: {
      rgb: opaque
        ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
        : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`,
      hsl: opaque
        ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
        : `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alpha})`,
    },
  };
}

export const convert = (input: string): Color => toColor(parseColor(input));

/** WCAG 2.1 relative luminance of an opaque sRGB color. */
export function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export interface Contrast {
  /** Contrast ratio from 1 to 21, rounded to 2 decimals. */
  ratio: number;
  /** Normal text, level AA (>= 4.5). */
  aa: boolean;
  /** Large text, level AA (>= 3). */
  aaLarge: boolean;
  /** Normal text, level AAA (>= 7). */
  aaa: boolean;
  /** Large text, level AAA (>= 4.5). */
  aaaLarge: boolean;
}

/**
 * WCAG 2.1 contrast ratio. A translucent foreground is composited over the
 * background first; the background's own alpha is ignored (treated as opaque).
 */
export function contrast(foreground: string, background: string): Contrast {
  const bg = parseColor(background);
  const fg = parseColor(foreground);
  const over: Rgba = {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
  const l1 = luminance(over);
  const l2 = luminance(bg);
  const ratio = round((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), 2);
  return { ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

/** Linear blend in sRGB; `weight` is the share of `color2` (0 = all color1, 1 = all color2). */
export function mix(color1: string, color2: string, weight = 0.5): Color {
  const a = parseColor(color1);
  const b = parseColor(color2);
  const lerp = (x: number, y: number) => x + (y - x) * weight;
  return toColor({ r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b), a: lerp(a.a, b.a) });
}

export interface Adjustments {
  /** Lightness delta in percentage points (-100..100). */
  lightness?: number;
  /** Saturation delta in percentage points (-100..100). */
  saturation?: number;
  /** Hue rotation in degrees. */
  hue?: number;
  /** Absolute alpha to set (0–1). */
  alpha?: number;
}

/** Shift a color in HSL space (lightness, saturation, hue deltas) and/or set its alpha. */
export function adjust(input: string, adjustments: Adjustments): Color {
  const hsl = rgbToHsl(parseColor(input));
  const { lightness = 0, saturation = 0, hue = 0, alpha } = adjustments;
  return toColor(
    hslToRgb({
      h: hsl.h + hue,
      s: clamp(hsl.s + saturation, 0, 100),
      l: clamp(hsl.l + lightness, 0, 100),
      a: alpha ?? hsl.a,
    })
  );
}

const colorField = (description: string) =>
  z.string().min(1).describe(`${description} (hex, rgb(), hsl() or CSS name)`);
const colorShape = "object with hex, hexAlpha, rgb {r,g,b,a}, hsl {h,s,l,a}, css {rgb,hsl}";

const RED: Color = {
  hex: "#ff0000",
  hexAlpha: null,
  rgb: { r: 255, g: 0, b: 0, a: 1 },
  hsl: { h: 0, s: 100, l: 50, a: 1 },
  css: { rgb: "rgb(255, 0, 0)", hsl: "hsl(0, 100%, 50%)" },
};

export const functions = [
  defineFunction({
    name: "color/convert",
    description:
      "Parse a color in any common notation (hex, rgb()/rgba(), hsl()/hsla(), CSS name) and return it in every notation at once: hex, rgb, hsl and CSS strings.",
    input: z.object({ input: colorField("Color to convert") }),
    returns: colorShape,
    tags: ["color", "convert", "hex", "rgb", "hsl", "css", "parse"],
    examples: [
      {
        description: "Shorthand hex with alpha",
        input: { input: "#f008" },
        output: {
          hex: "#ff0000",
          hexAlpha: "#ff000088",
          rgb: { r: 255, g: 0, b: 0, a: 0.533 },
          hsl: { h: 0, s: 100, l: 50, a: 0.533 },
          css: { rgb: "rgba(255, 0, 0, 0.533)", hsl: "hsla(0, 100%, 50%, 0.533)" },
        },
      },
      {
        description: "HSL to everything",
        input: { input: "hsl(210, 50%, 40%)" },
        output: {
          hex: "#336699",
          hexAlpha: null,
          rgb: { r: 51, g: 102, b: 153, a: 1 },
          hsl: { h: 210, s: 50, l: 40, a: 1 },
          css: { rgb: "rgb(51, 102, 153)", hsl: "hsl(210, 50%, 40%)" },
        },
      },
      { description: "Named color", input: { input: "red" }, output: RED },
    ],
    run: (a) => convert(a.input),
  }),
  defineFunction({
    name: "color/contrast",
    description:
      "WCAG 2.1 contrast ratio between a foreground and background color, with pass/fail flags for AA and AAA at normal and large text sizes.",
    input: z.object({
      foreground: colorField("Text or foreground color"),
      background: colorField("Background color"),
    }),
    returns: "object with ratio (1–21), aa, aaLarge, aaa, aaaLarge",
    tags: ["color", "contrast", "wcag", "accessibility", "a11y", "luminance"],
    examples: [
      {
        description: "Black on white",
        input: { foreground: "#000", background: "#fff" },
        output: { ratio: 21, aa: true, aaLarge: true, aaa: true, aaaLarge: true },
      },
      {
        description: "Mid gray on white fails AA for normal text",
        input: { foreground: "#888888", background: "white" },
        output: { ratio: 3.54, aa: false, aaLarge: true, aaa: false, aaaLarge: false },
      },
    ],
    run: (a) => contrast(a.foreground, a.background),
  }),
  defineFunction({
    name: "color/mix",
    description:
      "Blend two colors in sRGB. `weight` is the share of the second color: 0 returns color1, 1 returns color2, 0.5 (default) is an even mix.",
    input: z.object({
      color1: colorField("First color"),
      color2: colorField("Second color"),
      weight: z.number().min(0).max(1).default(0.5).describe("Share of color2, 0–1"),
    }),
    returns: colorShape,
    tags: ["color", "mix", "blend", "interpolate", "lerp"],
    examples: [
      {
        description: "Even mix of red and blue",
        input: { color1: "red", color2: "blue" },
        output: {
          hex: "#800080",
          hexAlpha: null,
          rgb: { r: 128, g: 0, b: 128, a: 1 },
          hsl: { h: 300, s: 100, l: 25.1, a: 1 },
          css: { rgb: "rgb(128, 0, 128)", hsl: "hsl(300, 100%, 25.1%)" },
        },
      },
      {
        description: "Tint: 25% toward white",
        input: { color1: "#0000ff", color2: "#ffffff", weight: 0.25 },
        output: {
          hex: "#4040ff",
          hexAlpha: null,
          rgb: { r: 64, g: 64, b: 255, a: 1 },
          hsl: { h: 240, s: 100, l: 62.5, a: 1 },
          css: { rgb: "rgb(64, 64, 255)", hsl: "hsl(240, 100%, 62.5%)" },
        },
      },
    ],
    run: (a) => mix(a.color1, a.color2, a.weight),
  }),
  defineFunction({
    name: "color/adjust",
    description:
      "Lighten, darken, saturate, desaturate or rotate the hue of a color by HSL deltas, and/or set its alpha. Omitted fields leave that channel unchanged.",
    input: z.object({
      input: colorField("Color to adjust"),
      lightness: z
        .number()
        .min(-100)
        .max(100)
        .optional()
        .describe("Lightness delta in points; negative darkens"),
      saturation: z
        .number()
        .min(-100)
        .max(100)
        .optional()
        .describe("Saturation delta in points; negative desaturates"),
      hue: z.number().finite().optional().describe("Hue rotation in degrees"),
      alpha: z.number().min(0).max(1).optional().describe("Absolute alpha to set, 0–1"),
    }),
    returns: colorShape,
    tags: ["color", "adjust", "lighten", "darken", "saturate", "desaturate", "hue", "alpha"],
    examples: [
      {
        description: "Darken by 20 points",
        input: { input: "hsl(210, 50%, 40%)", lightness: -20 },
        output: {
          hex: "#1a334d",
          hexAlpha: null,
          rgb: { r: 26, g: 51, b: 77, a: 1 },
          hsl: { h: 210.6, s: 49.5, l: 20.2, a: 1 },
          css: { rgb: "rgb(26, 51, 77)", hsl: "hsl(210.6, 49.5%, 20.2%)" },
        },
      },
      {
        description: "Rotate hue 120° and set alpha",
        input: { input: "red", hue: 120, alpha: 0.5 },
        output: {
          hex: "#00ff00",
          hexAlpha: "#00ff0080",
          rgb: { r: 0, g: 255, b: 0, a: 0.5 },
          hsl: { h: 120, s: 100, l: 50, a: 0.5 },
          css: { rgb: "rgba(0, 255, 0, 0.5)", hsl: "hsla(120, 100%, 50%, 0.5)" },
        },
      },
    ],
    run: (a) => adjust(a.input, a),
  }),
];
