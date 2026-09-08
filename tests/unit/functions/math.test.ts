import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  baseConvert,
  clamp,
  formatBytes,
  functions,
  percentage,
  round,
  stats,
} from "../../../src/functions/math.js";

const fn = (name: string) => {
  const found = functions.find((f) => f.name === `math/${name}`);
  if (!found) throw new Error(`no function math/${name}`);
  return found;
};

const expectError = (name: string, args: unknown, errorCode: string) => {
  expect(execute(fn(name), args)).toMatchObject({ success: false, errorCode });
};

describe("examples reproduce", () => {
  for (const f of functions) {
    for (const ex of f.examples) {
      it(`${f.name}: ${ex.description}`, () => {
        expect(execute(f, ex.input)).toEqual({ success: true, result: ex.output });
      });
    }
  }
});

describe("round", () => {
  it("avoids the classic floating-point traps", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(1.255, 2)).toBe(1.26);
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(1.45, 1)).toBe(1.5);
  });
  it("rounds half away from zero", () => {
    expect(round(2.5)).toBe(3);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(0.5)).toBe(1);
    expect(round(-0.5)).toBe(-1);
  });
  it("never returns negative zero", () => {
    expect(Object.is(round(-0.4, 0), 0)).toBe(true);
    expect(Object.is(round(-0.0001, 2), 0)).toBe(true);
    expect(Object.is(round(-0), 0)).toBe(true);
  });
  it("defaults to 0 decimals and supports up to 15", () => {
    expect(round(3.7)).toBe(4);
    expect(round(0.1 + 0.2, 15)).toBe(0.3);
    expect(execute(fn("round"), { value: 3.14159 })).toEqual({ success: true, result: 3 });
  });
  it("rejects decimals outside 0–15 and non-finite values", () => {
    expectError("round", { value: 1, decimals: 16 }, "INVALID_INPUT");
    expectError("round", { value: 1, decimals: -1 }, "INVALID_INPUT");
    expectError("round", { value: 1, decimals: 1.5 }, "INVALID_INPUT");
    expectError("round", { value: Infinity }, "INVALID_INPUT");
    expectError("round", { value: "1" }, "INVALID_INPUT");
  });
});

describe("clamp", () => {
  it("constrains to the inclusive range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it("allows min === max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(-5, 3, 3)).toBe(3);
  });
  it("rejects min > max with INVALID_RANGE", () => {
    expect(() => clamp(1, 10, 0)).toThrow();
    expectError("clamp", { value: 1, min: 10, max: 0 }, "INVALID_RANGE");
  });
  it("rejects missing bounds", () => {
    expectError("clamp", { value: 1, min: 0 }, "INVALID_INPUT");
  });
});

describe("percentage", () => {
  it("computes and rounds", () => {
    expect(percentage(25, 100)).toBe(25);
    expect(percentage(1, 3)).toBe(33.33);
    expect(percentage(2, 3, 0)).toBe(67);
    expect(percentage(-1, 4)).toBe(-25);
    expect(percentage(150, 100)).toBe(150);
    expect(percentage(0, 5)).toBe(0);
  });
  it("rejects a zero total with DIVISION_BY_ZERO", () => {
    expect(() => percentage(1, 0)).toThrow();
    expectError("percentage", { value: 1, total: 0 }, "DIVISION_BY_ZERO");
  });
  it("rejects too many decimals", () => {
    expectError("percentage", { value: 1, total: 3, decimals: 16 }, "INVALID_INPUT");
  });
});

describe("stats", () => {
  it("handles a single element", () => {
    expect(stats([7])).toEqual({
      count: 1,
      sum: 7,
      min: 7,
      max: 7,
      mean: 7,
      median: 7,
      variance: 0,
      stddev: 0,
    });
  });
  it("median averages the middle pair for an even count", () => {
    expect(stats([4, 1, 3, 2])).toMatchObject({ median: 2.5, min: 1, max: 4, sum: 10, mean: 2.5 });
    expect(stats([5, 1, 3]).median).toBe(3);
  });
  it("uses population variance", () => {
    expect(stats([2, 4, 4, 4, 5, 5, 7, 9])).toMatchObject({ variance: 4, stddev: 2 });
    expect(stats([-1, 1])).toMatchObject({ mean: 0, variance: 1, stddev: 1, min: -1, max: 1 });
  });
  it("does not mutate the input", () => {
    const values = [3, 1, 2];
    stats(values);
    expect(values).toEqual([3, 1, 2]);
  });
  it("rejects an empty list through the schema", () => {
    expectError("stats", { values: [] }, "INVALID_INPUT");
    expectError("stats", { values: [1, "2"] }, "INVALID_INPUT");
    expectError("stats", { values: [1, NaN] }, "INVALID_INPUT");
  });
  it("rejects an empty list directly with EMPTY_INPUT", () => {
    expect(() => stats([])).toThrow(expect.objectContaining({ code: "EMPTY_INPUT" }));
  });
});

describe("baseConvert", () => {
  it("converts between bases", () => {
    expect(baseConvert("255", 10, 16)).toBe("ff");
    expect(baseConvert("FF", 16, 2)).toBe("11111111");
    expect(baseConvert("777", 8, 10)).toBe("511");
    expect(baseConvert("z", 36, 10)).toBe("35");
    expect(baseConvert("0", 10, 2)).toBe("0");
  });
  it("supports negative numbers", () => {
    expect(baseConvert("-ff", 16, 10)).toBe("-255");
    expect(baseConvert("-255", 10, 2)).toBe("-11111111");
  });
  it("is arbitrary precision", () => {
    expect(baseConvert("ffffffffffffffffffff", 16, 10)).toBe("1208925819614629174706175");
    expect(baseConvert("1208925819614629174706175", 10, 16)).toBe("ffffffffffffffffffff");
  });
  it("rejects digits invalid for the source base", () => {
    expectError("baseConvert", { value: "12", fromBase: 2, toBase: 10 }, "INVALID_NUMBER");
    expectError("baseConvert", { value: "g", fromBase: 16, toBase: 10 }, "INVALID_NUMBER");
    expectError("baseConvert", { value: "1.5", fromBase: 10, toBase: 2 }, "INVALID_NUMBER");
    expectError("baseConvert", { value: "", fromBase: 10, toBase: 2 }, "INVALID_NUMBER");
    expectError("baseConvert", { value: "-", fromBase: 10, toBase: 2 }, "INVALID_NUMBER");
    expectError("baseConvert", { value: " 1", fromBase: 10, toBase: 2 }, "INVALID_NUMBER");
  });
  it("rejects bases outside 2–36", () => {
    expectError("baseConvert", { value: "1", fromBase: 1, toBase: 10 }, "INVALID_INPUT");
    expectError("baseConvert", { value: "1", fromBase: 10, toBase: 37 }, "INVALID_INPUT");
  });
});

describe("formatBytes", () => {
  it("binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KiB");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(1e12)).toBe("931.32 GiB");
    expect(formatBytes(2 ** 40)).toBe("1 TiB");
  });
  it("negative sizes keep their sign", () => {
    expect(formatBytes(-1536)).toBe("-1.5 KiB");
    expect(formatBytes(-512)).toBe("-512 B");
  });
  it("decimal units", () => {
    expect(formatBytes(1000, 1000)).toBe("1 kB");
    expect(formatBytes(1500, 1000)).toBe("1.5 kB");
    expect(formatBytes(1e12, 1000)).toBe("1 TB");
    expect(formatBytes(999, 1000)).toBe("999 B");
  });
  it("honours decimals and caps at the largest unit", () => {
    expect(formatBytes(1536, 1024, 0)).toBe("2 KiB");
    expect(formatBytes(1234567, 1024, 3)).toBe("1.177 MiB");
    expect(formatBytes(2 ** 70)).toBe("1024 EiB");
  });
  it("rejects unsupported bases", () => {
    expectError("formatBytes", { bytes: 1, base: 1010 }, "INVALID_INPUT");
    expectError("formatBytes", { bytes: Infinity }, "INVALID_INPUT");
  });
});
