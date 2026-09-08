import { describe, it, expect } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  adjust,
  contrast,
  convert,
  functions,
  mix,
  NAMED_COLORS,
} from "../../../src/functions/color.js";

const fn = (name: string) => functions.find((f) => f.name === `color/${name}`)!;

describe("color/convert", () => {
  it("expands hex shorthand", () => {
    expect(convert("#abc").hex).toBe("#aabbcc");
    expect(convert("#ABC").hex).toBe("#aabbcc");
    expect(convert("#abcd")).toMatchObject({ hex: "#aabbcc", hexAlpha: "#aabbccdd" });
    expect(convert("#abcd").rgb.a).toBeCloseTo(221 / 255, 3);
  });

  it("reports hexAlpha only for translucent colors", () => {
    expect(convert("#112233").hexAlpha).toBeNull();
    expect(convert("#112233ff").hexAlpha).toBeNull();
    expect(convert("#11223380").hexAlpha).toBe("#11223380");
  });

  it("parses rgb() and rgba() in legacy and modern syntax", () => {
    expect(convert("rgb(255, 128, 0)").hex).toBe("#ff8000");
    expect(convert("rgba(255, 128, 0, 0.5)").rgb).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
    expect(convert("rgb(255 128 0 / 50%)").rgb.a).toBe(0.5);
    expect(convert("rgb(100%, 50%, 0%)").hex).toBe("#ff8000");
  });

  it("clamps out-of-range channels like CSS", () => {
    expect(convert("rgb(300, -5, 0)").rgb).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(convert("rgba(0, 0, 0, 2)").rgb.a).toBe(1);
  });

  it("parses hsl() and round-trips through hex", () => {
    const cases = [
      "hsl(0, 100%, 50%)",
      "hsl(120, 60%, 30%)",
      "hsl(210, 50%, 40%)",
      "hsl(300deg, 80%, 70%)",
    ];
    for (const input of cases) {
      const first = convert(input);
      const again = convert(first.hex);
      expect(again.hsl.h).toBeCloseTo(first.hsl.h, 0);
      expect(again.hsl.s).toBeCloseTo(first.hsl.s, 0);
      expect(again.hsl.l).toBeCloseTo(first.hsl.l, 0);
      expect(again.hex).toBe(first.hex);
    }
    expect(convert("hsl(210, 50%, 40%)").hsl).toEqual({ h: 210, s: 50, l: 40, a: 1 });
    expect(convert("hsla(0 0% 100% / 0.25)").css.hsl).toBe("hsla(0, 0%, 100%, 0.25)");
  });

  it("normalizes hue outside 0–360", () => {
    expect(convert("hsl(-120, 100%, 50%)").hex).toBe("#0000ff");
    expect(convert("hsl(480, 100%, 50%)").hex).toBe("#00ff00");
  });

  it("knows named colors case-insensitively, including transparent", () => {
    expect(convert("RebeccaPurple").hex).toBe("#663399");
    expect(convert(" tomato ").hex).toBe("#ff6347");
    expect(convert("transparent").rgb).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(Object.keys(NAMED_COLORS).length).toBeGreaterThanOrEqual(36);
  });

  it("produces css strings", () => {
    expect(convert("#ff8000").css).toEqual({
      rgb: "rgb(255, 128, 0)",
      hsl: "hsl(30.1, 100%, 50%)",
    });
    expect(convert("#ff800080").css.rgb).toBe("rgba(255, 128, 0, 0.502)");
  });

  it("fails on unrecognized input", () => {
    for (const input of ["#12", "#ggg", "rgb(1,2)", "hsl(1, 2, 3)", "notacolor", "rgb(a,b,c)"]) {
      expect(execute(fn("convert"), { input })).toMatchObject({
        success: false,
        errorCode: "INVALID_COLOR",
      });
    }
    expect(execute(fn("convert"), { input: "" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("color/contrast", () => {
  it("gives 21 for black on white and 1 for identical colors", () => {
    expect(contrast("#000", "#fff")).toEqual({
      ratio: 21,
      aa: true,
      aaLarge: true,
      aaa: true,
      aaaLarge: true,
    });
    expect(contrast("red", "red").ratio).toBe(1);
  });

  it("is symmetric for opaque colors", () => {
    const pairs: Array<[string, string]> = [
      ["#336699", "#ffffff"],
      ["tomato", "navy"],
      ["hsl(50, 100%, 50%)", "#333"],
    ];
    for (const [a, b] of pairs) expect(contrast(a, b).ratio).toBe(contrast(b, a).ratio);
  });

  it("matches known WCAG values", () => {
    expect(contrast("#777777", "#ffffff").ratio).toBe(4.48);
    expect(contrast("#767676", "#ffffff")).toMatchObject({ ratio: 4.54, aa: true, aaa: false });
  });

  it("composites a translucent foreground over the background", () => {
    expect(contrast("rgba(0, 0, 0, 0.5)", "#fff").ratio).toBeLessThan(21);
    expect(contrast("rgba(0, 0, 0, 0)", "#fff").ratio).toBe(1);
  });

  it("fails on an invalid color", () => {
    expect(execute(fn("contrast"), { foreground: "#000", background: "nope" })).toMatchObject({
      success: false,
      errorCode: "INVALID_COLOR",
    });
  });
});

describe("color/mix", () => {
  it("returns the endpoints at weight 0 and 1", () => {
    expect(mix("red", "blue", 0).hex).toBe("#ff0000");
    expect(mix("red", "blue", 1).hex).toBe("#0000ff");
  });

  it("mixes channels and alpha linearly", () => {
    expect(mix("#000", "#fff").hex).toBe("#808080");
    expect(mix("rgba(0,0,0,0)", "rgba(0,0,0,1)").rgb.a).toBe(0.5);
    expect(mix("#000", "#fff", 0.25).hex).toBe("#404040");
  });

  it("rejects a weight outside 0–1 via the schema", () => {
    expect(execute(fn("mix"), { color1: "red", color2: "blue", weight: 2 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });

  it("fails on an invalid color", () => {
    expect(execute(fn("mix"), { color1: "red", color2: "#xyz" })).toMatchObject({
      success: false,
      errorCode: "INVALID_COLOR",
    });
  });
});

describe("color/adjust", () => {
  it("lightens and darkens with clamping", () => {
    expect(adjust("hsl(200, 50%, 50%)", { lightness: 20 }).hsl.l).toBe(70);
    expect(adjust("hsl(200, 50%, 50%)", { lightness: -20 }).hsl.l).toBe(30);
    expect(adjust("#808080", { lightness: 100 }).hex).toBe("#ffffff");
    expect(adjust("#808080", { lightness: -100 }).hex).toBe("#000000");
  });

  it("saturates and desaturates", () => {
    expect(adjust("hsl(200, 50%, 50%)", { saturation: 50 }).hsl.s).toBe(100);
    expect(adjust("hsl(200, 50%, 50%)", { saturation: -50 }).hsl.s).toBe(0);
  });

  it("rotates hue and wraps around", () => {
    expect(adjust("red", { hue: 120 }).hex).toBe("#00ff00");
    expect(adjust("red", { hue: -120 }).hex).toBe("#0000ff");
    expect(adjust("red", { hue: 720 }).hex).toBe("#ff0000");
  });

  it("sets alpha absolutely and leaves other channels alone", () => {
    const out = adjust("#336699", { alpha: 0.25 });
    expect(out).toMatchObject({ hex: "#336699", hexAlpha: "#33669940" });
    expect(out.rgb.a).toBe(0.25);
    expect(adjust("#336699", {})).toEqual(convert("#336699"));
  });

  it("rejects out-of-range deltas via the schema", () => {
    expect(execute(fn("adjust"), { input: "red", lightness: 150 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });

  it("fails on an invalid color", () => {
    expect(execute(fn("adjust"), { input: "hsl()", hue: 10 })).toMatchObject({
      success: false,
      errorCode: "INVALID_COLOR",
    });
  });
});
