import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/define.js";
import {
  csvToJson,
  functions,
  jsonToCsv,
  jsonToMarkdownTable,
  jsonToYaml,
  markdownToHtml,
  xmlToJson,
  yamlToJson,
} from "../../../src/functions/conversion.js";

const fn = (name: string) => {
  const found = functions.find((f) => f.name === `conversion/${name}`);
  if (!found) throw new Error(`no function conversion/${name}`);
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

describe("jsonToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(jsonToCsv([])).toBe("");
  });
  it("uses the union of keys in first-seen order", () => {
    expect(jsonToCsv([{ a: 1 }, { b: 2 }])).toBe("a,b\n1,\n,2");
    expect(jsonToCsv([{ b: 1, a: 2 }, { c: 3 }])).toBe("b,a,c\n1,2,\n,,3");
  });
  it("JSON-encodes nested values and quotes as needed", () => {
    expect(jsonToCsv([{ a: { x: 1 }, b: [1, 2] }])).toBe('a,b\n"{""x"":1}","[1,2]"');
    expect(jsonToCsv([{ a: "x,y", b: 'say "hi"', c: "l1\nl2" }])).toBe(
      'a,b,c\n"x,y","say ""hi""","l1\nl2"'
    );
  });
  it("renders null and booleans plainly", () => {
    expect(jsonToCsv([{ a: null, b: true, c: 0 }])).toBe("a,b,c\n,true,0");
  });
  it("rejects non-array or non-object rows", () => {
    expectError("jsonToCsv", { input: "a,b" }, "INVALID_INPUT");
    expectError("jsonToCsv", { input: [1, 2] }, "INVALID_INPUT");
  });
});

describe("csvToJson", () => {
  it("parses a single-column CSV", () => {
    expect(csvToJson("a\n1\n2")).toEqual([{ a: "1" }, { a: "2" }]);
  });
  it("returns [] for empty input", () => {
    expect(csvToJson("")).toEqual([]);
    expect(csvToJson("a,b")).toEqual([]);
  });
  it("keeps every cell a string and skips blank lines", () => {
    expect(csvToJson("n,ok\n1,true\n\n2,false\n")).toEqual([
      { n: "1", ok: "true" },
      { n: "2", ok: "false" },
    ]);
  });
  it("handles quoted commas, quotes and newlines", () => {
    expect(csvToJson('a,b\n"x,y","say ""hi"""\n"l1\nl2",z')).toEqual([
      { a: "x,y", b: 'say "hi"' },
      { a: "l1\nl2", b: "z" },
    ]);
  });
  it("round-trips jsonToCsv output with heterogeneous keys", () => {
    const csv = jsonToCsv([{ a: 1 }, { b: 2 }]);
    expect(csv.split("\n")[0]).toBe("a,b");
    expect(csvToJson(csv)).toEqual([
      { a: "1", b: "" },
      { a: "", b: "2" },
    ]);
  });
  it("tolerates rows with too few fields but rejects rows with too many", () => {
    expect(csvToJson("a,b\n1\n2,3")).toEqual([{ a: "1" }, { a: "2", b: "3" }]);
    expectError("csvToJson", { input: "a,b\n1,2,3" }, "PARSE_ERROR");
  });
  it("rejects non-string input", () => {
    expectError("csvToJson", { input: ["a"] }, "INVALID_INPUT");
  });
});

describe("yamlToJson", () => {
  it("parses the JSON-compatible subset", () => {
    expect(yamlToJson("a: 1\nb: [x, y]\nc:\n  d: true\n  e: null")).toEqual({
      a: 1,
      b: ["x", "y"],
      c: { d: true, e: null },
    });
    expect(yamlToJson("- 1\n- two")).toEqual([1, "two"]);
    expect(yamlToJson("42")).toBe(42);
  });
  it("returns null for an empty document", () => {
    expect(yamlToJson("")).toBeNull();
    expect(yamlToJson("# just a comment\n")).toBeNull();
    expect(yamlToJson("~")).toBeNull();
  });
  it("does not apply YAML 1.1 boolean coercion", () => {
    expect(yamlToJson("a: yes\nb: no")).toEqual({ a: "yes", b: "no" });
  });
  it("rejects custom tags", () => {
    expectError("yamlToJson", { input: "f: !!js/function 'function(){}'" }, "PARSE_ERROR");
    expectError("yamlToJson", { input: "d: !!timestamp 2001-12-14" }, "PARSE_ERROR");
  });
  it("rejects invalid indentation and syntax", () => {
    expectError("yamlToJson", { input: "a:\n  b: 1\n c: 2" }, "PARSE_ERROR");
    expectError("yamlToJson", { input: "a: [1, 2" }, "PARSE_ERROR");
  });
});

describe("jsonToYaml", () => {
  it("sorts keys recursively", () => {
    expect(jsonToYaml({ z: 1, a: { y: 2, b: 3 } })).toBe("a:\n  b: 3\n  'y': 2\nz: 1\n");
  });
  it("serializes scalars and arrays", () => {
    expect(jsonToYaml(1)).toBe("1\n");
    expect(jsonToYaml("hi")).toBe("hi\n");
    expect(jsonToYaml(null)).toBe("null\n");
    expect(jsonToYaml([1, "two", { x: null }])).toBe("- 1\n- two\n- x: null\n");
  });
  it("does not wrap long strings", () => {
    const long = "word ".repeat(50).trim();
    expect(jsonToYaml({ s: long })).toBe(`s: ${long}\n`);
  });
  it("round-trips through yamlToJson", () => {
    const value = { b: [1, 2, { c: "x" }], a: "yes", n: null };
    expect(yamlToJson(jsonToYaml(value))).toEqual(value);
  });
});

describe("xmlToJson", () => {
  it("keeps numeric-looking text as strings", () => {
    expect(xmlToJson("<r><a>00123</a><b>0x1F</b><c>1e5</c><d>true</d></r>")).toEqual({
      r: { a: "00123", b: "0x1F", c: "1e5", d: "true" },
    });
  });
  it("prefixes attributes with @ and uses #text alongside them", () => {
    expect(xmlToJson('<a id="1" ref="0x1F"><b>x</b></a>')).toEqual({
      a: { "@id": "1", "@ref": "0x1F", b: "x" },
    });
    expect(xmlToJson('<b id="7">t</b>')).toEqual({ b: { "@id": "7", "#text": "t" } });
  });
  it("turns repeated elements into arrays", () => {
    expect(xmlToJson("<r><i>1</i><i>2</i><j>3</j></r>")).toEqual({ r: { i: ["1", "2"], j: "3" } });
  });
  it("trims text and decodes predefined and numeric entities without DOCTYPE expansion", () => {
    expect(xmlToJson("<a> x &amp; y &lt;z&gt; &#65;&#x42; &quot;q&quot; </a>")).toEqual({
      a: 'x & y <z> AB "q"',
    });
    expect(xmlToJson('<a t="&lt;1&gt;">&#xD800;</a>')).toEqual({
      a: { "@t": "<1>", "#text": "&#xD800;" },
    });
  });
  it("rejects malformed XML and plain text with PARSE_ERROR", () => {
    expectError("xmlToJson", { input: "<a><b></a>" }, "PARSE_ERROR");
    expectError("xmlToJson", { input: "not xml" }, "PARSE_ERROR");
    expectError("xmlToJson", { input: "" }, "PARSE_ERROR");
    expectError("xmlToJson", { input: "<a>" }, "PARSE_ERROR");
    expectError("xmlToJson", { input: "<a></a><b></b>" }, "PARSE_ERROR");
  });
  it("does not expand DOCTYPE entities", () => {
    const xml = '<!DOCTYPE a [<!ENTITY x "expanded">]><a>&x;</a>';
    const r = execute(fn("xmlToJson"), { input: xml });
    if (r.success) expect(JSON.stringify(r.result)).not.toContain("expanded");
    else expect(r.errorCode).toBe("PARSE_ERROR");
  });
});

describe("markdownToHtml", () => {
  it("renders GitHub-flavored Markdown", () => {
    expect(markdownToHtml("# hi")).toBe("<h1>hi</h1>\n");
    expect(markdownToHtml("~~gone~~")).toBe("<p><del>gone</del></p>\n");
    expect(markdownToHtml("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n");
    expect(markdownToHtml("")).toBe("");
  });
  it("passes raw HTML (including <script>) through unsanitized", () => {
    const html = markdownToHtml("<script>alert(1)</script>\n\n**b**");
    expect(html).toContain("<script>alert(1)</script>");
    expect(html).toContain("<strong>b</strong>");
  });
  it("rejects non-string input", () => {
    expectError("markdownToHtml", { input: 1 }, "INVALID_INPUT");
  });
});

describe("jsonToMarkdownTable", () => {
  it("returns an empty string for no rows", () => {
    expect(jsonToMarkdownTable([])).toBe("");
  });
  it("escapes pipes and flattens newlines", () => {
    expect(jsonToMarkdownTable([{ a: "x|y", b: "l1\nl2" }])).toBe(
      "| a | b |\n| --- | --- |\n| x\\|y | l1 l2 |"
    );
  });
  it("leaves cells blank for missing keys and JSON-encodes non-strings", () => {
    expect(jsonToMarkdownTable([{ a: 1 }, { b: { x: "y|z" }, c: null, d: [1, 2] }])).toBe(
      '| a | b | c | d |\n| --- | --- | --- | --- |\n| 1 |  |  |  |\n|  | {"x":"y\\|z"} | null | [1,2] |'
    );
  });
  it("rejects non-object rows", () => {
    expectError("jsonToMarkdownTable", { input: ["a"] }, "INVALID_INPUT");
    expectError("jsonToMarkdownTable", { input: {} }, "INVALID_INPUT");
  });
});
