import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  coerce,
  compare,
  functions,
  inc,
  maxSatisfying,
  parse,
  satisfies,
  sort,
} from "../../../src/functions/semver.js";

const fn = (name: string) => {
  const found = functions.find((f) => f.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
};

const failure = (name: string, args: unknown) => {
  const r = execute(fn(name), args);
  expect(r.success).toBe(false);
  return r as { success: false; errorCode: string; error: string; details?: unknown };
};

describe("semver/parse", () => {
  it("splits all components", () => {
    expect(parse("1.2.3-rc.1.x+sha.abc")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ["rc", 1, "x"],
      build: ["sha", "abc"],
      version: "1.2.3-rc.1.x",
    });
  });

  it("tolerates a leading v and surrounding whitespace", () => {
    expect(parse(" v0.0.1 ").version).toBe("0.0.1");
  });

  it("rejects partial or malformed versions", () => {
    for (const bad of ["1.2", "1.2.3.4", "abc", "1.2.3-", "01.2.3"]) {
      expect(() => parse(bad)).toThrow();
    }
    const r = failure("semver/parse", { version: "1.2" });
    expect(r.errorCode).toBe("INVALID_VERSION");
    expect(r.details).toEqual({ version: "1.2" });
  });
});

describe("semver/coerce", () => {
  it("fills in missing parts and strips extra text", () => {
    expect(coerce("v1.2")).toBe("1.2.0");
    expect(coerce("3")).toBe("3.0.0");
    expect(coerce("1.2.3.4")).toBe("1.2.3");
    expect(coerce("release-2.5.1-beta")).toBe("2.5.1");
  });

  it("fails when no version is present", () => {
    expect(failure("semver/coerce", { input: "latest" }).errorCode).toBe("INVALID_VERSION");
  });
});

describe("semver/compare", () => {
  it("orders numerically, not lexically", () => {
    expect(compare("1.10.0", "1.9.0")).toBe(1);
    expect(compare("1.9.0", "1.10.0")).toBe(-1);
    expect(compare("0.0.1", "0.0.1")).toBe(0);
  });

  it("orders prereleases before the release and among themselves", () => {
    expect(compare("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compare("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compare("1.0.0-alpha.1", "1.0.0-beta")).toBe(-1);
    expect(compare("1.0.0-beta.2", "1.0.0-beta.11")).toBe(-1);
    expect(compare("1.0.0-rc.1", "1.0.0")).toBe(-1);
  });

  it("ignores build metadata", () => {
    expect(compare("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
  });

  it("fails on an invalid side", () => {
    const r = failure("semver/compare", { a: "1.0.0", b: "nope" });
    expect(r.errorCode).toBe("INVALID_VERSION");
    expect(r.details).toEqual({ version: "nope" });
  });
});

describe("semver/satisfies", () => {
  it("evaluates caret, tilde, hyphen, x, and compound ranges", () => {
    expect(satisfies("1.4.2", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfies("1.5.0", "1.2.3 - 1.6.0")).toBe(true);
    expect(satisfies("1.99.0", "1.x")).toBe(true);
    expect(satisfies("1.5.0", ">=1.0.0 <2 || 3.x")).toBe(true);
    expect(satisfies("0.1.5", "^0.1.0")).toBe(true);
    expect(satisfies("0.2.0", "^0.1.0")).toBe(false);
  });

  it("excludes prereleases from plain ranges", () => {
    expect(satisfies("1.3.0-beta.1", "^1.2.0")).toBe(false);
    expect(satisfies("1.3.0-beta.1", ">=1.3.0-beta.0")).toBe(true);
  });

  it("fails with INVALID_RANGE on a malformed range", () => {
    const r = failure("semver/satisfies", { version: "1.0.0", range: ">>>1" });
    expect(r.errorCode).toBe("INVALID_RANGE");
  });

  it("fails with INVALID_VERSION on a malformed version", () => {
    expect(failure("semver/satisfies", { version: "1", range: "^1.0.0" }).errorCode).toBe(
      "INVALID_VERSION"
    );
  });
});

describe("semver/inc", () => {
  it("bumps each release type", () => {
    expect(inc("1.2.3", "major")).toBe("2.0.0");
    expect(inc("1.2.3", "minor")).toBe("1.3.0");
    expect(inc("1.2.3", "patch")).toBe("1.2.4");
    expect(inc("1.2.3", "premajor")).toBe("2.0.0-0");
    expect(inc("1.2.3", "preminor", "alpha")).toBe("1.3.0-alpha.0");
    expect(inc("1.2.3", "prepatch", "rc")).toBe("1.2.4-rc.0");
    expect(inc("1.2.4-rc.0", "prerelease")).toBe("1.2.4-rc.1");
    expect(inc("1.2.4-rc.1", "patch")).toBe("1.2.4");
  });

  it("fails on an invalid version or release", () => {
    expect(failure("semver/inc", { version: "x", release: "patch" }).errorCode).toBe(
      "INVALID_VERSION"
    );
    expect(failure("semver/inc", { version: "1.0.0", release: "hotfix" }).errorCode).toBe(
      "INVALID_INPUT"
    );
  });
});

describe("semver/sort", () => {
  it("sorts ascending by default with prereleases first", () => {
    expect(sort(["1.10.0", "1.2.0", "1.0.0", "1.0.0-alpha", "1.0.0-alpha.1"])).toEqual([
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0",
      "1.2.0",
      "1.10.0",
    ]);
  });

  it("sorts descending", () => {
    expect(sort(["1.0.0", "3.0.0", "2.0.0"], "desc")).toEqual(["3.0.0", "2.0.0", "1.0.0"]);
  });

  it("keeps original strings and handles an empty list", () => {
    expect(sort(["v2.0.0", "1.0.0"])).toEqual(["1.0.0", "v2.0.0"]);
    expect(sort([])).toEqual([]);
  });

  it("does not mutate the input", () => {
    const input = ["2.0.0", "1.0.0"];
    sort(input);
    expect(input).toEqual(["2.0.0", "1.0.0"]);
  });

  it("lists every invalid entry in details", () => {
    const r = failure("semver/sort", { versions: ["1.0.0", "bad", "1.2", "2.0.0"] });
    expect(r.errorCode).toBe("INVALID_VERSION");
    expect(r.details).toEqual({ invalid: ["bad", "1.2"] });
  });
});

describe("semver/maxSatisfying", () => {
  it("returns the highest in-range version", () => {
    expect(maxSatisfying(["1.2.0", "1.9.3", "2.0.0", "1.10.0"], "^1.2.0")).toBe("1.10.0");
    expect(maxSatisfying(["1.2.0", "1.2.1"], "~1.2.0")).toBe("1.2.1");
  });

  it("returns null when nothing matches or the list is empty", () => {
    expect(maxSatisfying(["1.0.0"], ">=2")).toBeNull();
    expect(maxSatisfying([], "*")).toBeNull();
  });

  it("fails with INVALID_RANGE on a bad range", () => {
    expect(failure("semver/maxSatisfying", { versions: ["1.0.0"], range: "^^" }).errorCode).toBe(
      "INVALID_RANGE"
    );
  });

  it("fails with INVALID_VERSION on a bad candidate", () => {
    const r = failure("semver/maxSatisfying", { versions: ["1.0.0", "nope"], range: "*" });
    expect(r.errorCode).toBe("INVALID_VERSION");
    expect(r.details).toEqual({ invalid: ["nope"] });
  });
});

describe("semver examples", () => {
  it.each(functions.flatMap((f) => f.examples.map((e) => [f.name, e.description, f, e] as const)))(
    "%s: %s",
    (_name, _desc, f, example) => {
      expect(execute(f, example.input)).toEqual({ success: true, result: example.output });
    }
  );
});
