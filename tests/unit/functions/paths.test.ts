import { describe, it, expect } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  functions,
  isInside,
  join,
  normalize,
  parse,
  relative,
  resolve,
} from "../../../src/functions/paths.js";

const fn = (name: string) => functions.find((f) => f.name === `paths/${name}`)!;

describe("paths/parse", () => {
  it("splits an absolute path", () => {
    expect(parse("/a/b/c.tar.gz")).toEqual({
      dir: "/a/b",
      base: "c.tar.gz",
      name: "c.tar",
      ext: ".gz",
      root: "/",
      isAbsolute: true,
      segments: ["a", "b", "c.tar.gz"],
    });
  });

  it("handles a bare filename and drops empty segments", () => {
    expect(parse("file")).toMatchObject({ dir: "", base: "file", ext: "", segments: ["file"] });
    expect(parse("/a//b/").segments).toEqual(["a", "b"]);
  });

  it("rejects a non-string path", () => {
    expect(execute(fn("parse"), { path: 42 })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("paths/join", () => {
  it("joins and normalizes", () => {
    expect(join(["a", "b/", "../c"])).toBe("a/c");
    expect(join(["/"])).toBe("/");
    expect(join(["", "x"])).toBe("x");
  });

  it("requires at least one segment", () => {
    expect(execute(fn("join"), { segments: [] })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("paths/normalize", () => {
  it("collapses dot segments and slashes", () => {
    expect(normalize("a/./b/../c//d")).toBe("a/c/d");
    expect(normalize("/../x")).toBe("/x");
    expect(normalize("")).toBe(".");
  });

  it("rejects missing path", () => {
    expect(execute(fn("normalize"), {})).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("paths/relative", () => {
  it("computes relative paths", () => {
    expect(relative("/a/b", "/a/c/d")).toBe("../c/d");
    expect(relative("/a/b", "/a/b")).toBe("");
    expect(relative("src/x", "src/y/z")).toBe("../y/z");
  });

  it("does not depend on process.cwd() for relative inputs", () => {
    expect(relative("../a", "../b")).toBe("../b");
    expect(relative("a", "b")).toBe("../b");
  });

  it("rejects missing fields", () => {
    expect(execute(fn("relative"), { from: "/a" })).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("paths/resolve", () => {
  it("resolves against the base", () => {
    expect(resolve("a/../b", "/root")).toBe("/root/b");
    expect(resolve("..", "/root/x")).toBe("/root");
    expect(resolve("/abs", "/root")).toBe("/abs");
  });

  it("fails on a relative base", () => {
    expect(execute(fn("resolve"), { path: "x", base: "rel" })).toMatchObject({
      success: false,
      errorCode: "INVALID_BASE",
    });
  });
});

describe("paths/isInside", () => {
  it("accepts nested paths and the directory itself", () => {
    expect(isInside("/a/b/c", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b/", "/a/b")).toBe(true);
    expect(isInside("/a/b/x/../y", "/a/b")).toBe(true);
  });

  it("catches .. escapes", () => {
    expect(isInside("/a/b/../c", "/a/b")).toBe(false);
    expect(isInside("/a/b/../../etc", "/a/b")).toBe(false);
    expect(isInside("data/../../secret", "data")).toBe(false);
    expect(isInside("..", ".")).toBe(false);
    expect(isInside("../../x", "..")).toBe(false);
  });

  it("does not treat a name prefix as a parent", () => {
    expect(isInside("/a/bc", "/a/b")).toBe(false);
  });

  it("works with relative paths against the same anchor", () => {
    expect(isInside("data/x", ".")).toBe(true);
    expect(isInside("../a/b", "../a")).toBe(true);
    expect(isInside("a", "../a")).toBe(false);
  });

  it("fails on mixed absolute and relative paths", () => {
    expect(execute(fn("isInside"), { path: "/a/b", directory: "a" })).toMatchObject({
      success: false,
      errorCode: "MIXED_PATH_TYPES",
    });
  });
});
