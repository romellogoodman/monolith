/**
 * Tests for format conversion utility functions
 */

import { describe, it, expect } from "vitest";
import {
  jsonToCsv,
  csvToJson,
  yamlToJson,
  jsonToYaml,
  xmlToJson,
  markdownToHtml,
} from "../../../src/utils/conversion/index.js";
import type { UtilityResponse } from "../../../src/types/index.js";

function ok<T>(r: UtilityResponse<T>): T {
  expect(r.success).toBe(true);
  return (r as { success: true; result: T }).result;
}

describe("Conversion Utilities", () => {
  it("jsonToCsv round-trips through csvToJson", () => {
    const data = [{ name: "Alice", age: "30" }];
    const csv = ok(jsonToCsv(data));
    expect(ok(csvToJson(csv))).toEqual(data);
  });

  it("yamlToJson parses mappings, sequences, and scalars", () => {
    expect(ok(yamlToJson("a: 1\nb:\n  - x\n  - y"))).toEqual({ a: 1, b: ["x", "y"] });
  });

  it("yamlToJson rejects malformed YAML as an error envelope", () => {
    const r = yamlToJson(": bad:\n  - [");
    expect(r.success).toBe(false);
  });

  it("jsonToYaml serializes with sorted keys", () => {
    expect(ok(jsonToYaml({ b: 2, a: 1 }))).toBe("a: 1\nb: 2\n");
  });

  it("yaml/json round-trips", () => {
    const obj = { name: "test", items: [1, 2, 3], nested: { ok: true } };
    expect(ok(yamlToJson(ok(jsonToYaml(obj))))).toEqual(obj);
  });

  it("xmlToJson parses elements and coalesces siblings into arrays", () => {
    expect(ok(xmlToJson("<root><a>1</a><a>2</a></root>"))).toEqual({ root: { a: [1, 2] } });
  });

  it("xmlToJson surfaces attributes with the @ prefix", () => {
    const result = ok(xmlToJson('<root id="x">hi</root>')) as {
      root: { "@id": string; "#text": string };
    };
    expect(result.root["@id"]).toBe("x");
  });

  it("markdownToHtml renders inline markdown", () => {
    expect(ok(markdownToHtml("**hi**"))).toBe("<p><strong>hi</strong></p>\n");
  });

  it("markdownToHtml renders GFM tables", () => {
    const html = ok(markdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |"));
    expect(html).toContain("<table>");
  });
});
