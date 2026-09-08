/**
 * urls/* — parse, build and rewrite URLs with the WHATWG `URL` class, so the
 * results match what browsers and Node produce (lowercased hosts, punycode
 * for unicode hostnames, percent-encoding, dot-segment resolution).
 */

import { z } from "zod";
import { defineFunction } from "../core/define.js";
import { fail } from "../core/responses.js";

export type Query = Record<string, string | string[]>;
export type QueryValue = string | number | boolean;
export type QueryInput = Record<string, QueryValue | QueryValue[]>;

export interface ParsedUrl {
  href: string;
  /** Scheme without the trailing colon, e.g. "https". */
  protocol: string;
  username: string;
  password: string;
  /** hostname plus ":port" when a non-default port is present. */
  host: string;
  hostname: string;
  /** Explicit non-default port, or null. */
  port: string | null;
  pathname: string;
  /** Query string including the leading "?" ("" when absent). */
  search: string;
  /** Decoded query parameters; a key that repeats becomes an array. */
  query: Query;
  /** Fragment without the leading "#". */
  hash: string;
  origin: string;
}

function toUrl(input: string, base?: string): URL {
  try {
    return new URL(input, base);
  } catch (error) {
    const what = base === undefined ? `"${input}"` : `"${input}" against "${base}"`;
    const message = error instanceof Error ? error.message : String(error);
    return fail("INVALID_URL", `Cannot parse ${what}: ${message}`);
  }
}

/** Collect search params into an object; repeated keys become arrays (in order). */
export function queryToObject(params: URLSearchParams): Query {
  const query: Query = {};
  for (const [key, value] of params) {
    const existing = query[key];
    if (existing === undefined) query[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else query[key] = [existing, value];
  }
  return query;
}

export function parse(input: string): ParsedUrl {
  const url = toUrl(input);
  return {
    href: url.href,
    protocol: url.protocol.replace(/:$/, ""),
    username: url.username,
    password: url.password,
    host: url.host,
    hostname: url.hostname,
    port: url.port === "" ? null : url.port,
    pathname: url.pathname,
    search: url.search,
    query: queryToObject(url.searchParams),
    hash: url.hash.replace(/^#/, ""),
    origin: url.origin,
  };
}

export interface BuildInput {
  hostname: string;
  protocol?: string;
  port?: number | string;
  pathname?: string;
  query?: QueryInput;
  hash?: string;
}

/** Assemble an href from components. Query values are percent-encoded; arrays repeat the key. */
export function build(parts: BuildInput): string {
  const protocol = parts.protocol ?? "https";
  const url = toUrl(`${protocol}://${parts.hostname}`);
  if (parts.port !== undefined && parts.port !== "") url.port = String(parts.port);
  if (parts.pathname !== undefined) url.pathname = parts.pathname;
  if (parts.query) {
    for (const [key, value] of Object.entries(parts.query)) {
      for (const v of Array.isArray(value) ? value : [value])
        url.searchParams.append(key, String(v));
    }
  }
  if (parts.hash !== undefined) url.hash = parts.hash;
  return url.href;
}

/** Set, replace (arrays repeat the key) or remove (null) query parameters, keeping the rest. */
export function setQuery(
  input: string,
  query: Record<string, QueryValue | QueryValue[] | null>
): string {
  const url = toUrl(input);
  for (const [key, value] of Object.entries(query)) {
    if (value === null) url.searchParams.delete(key);
    else if (Array.isArray(value)) {
      url.searchParams.delete(key);
      for (const v of value) url.searchParams.append(key, String(v));
    } else url.searchParams.set(key, String(value)); // keeps the parameter's position
  }
  return url.href;
}

/** Resolve a possibly-relative URL against a base, like a browser resolving a link. */
export function resolve(url: string, base: string): string {
  return toUrl(url, base).href;
}

/**
 * Canonical form for comparison: lowercase scheme and host, default ports
 * and dot segments removed, query parameters sorted by key (stable for
 * repeats), empty "?" and "#" dropped.
 */
export function normalize(input: string): string {
  const url = toUrl(input);
  if (url.search === "" || url.search === "?") url.search = "";
  else url.searchParams.sort();
  if (url.hash === "" || url.hash === "#") url.hash = "";
  return url.href;
}

const queryValue = z.union([z.string(), z.number(), z.boolean()]);
const queryField = z
  .record(z.string(), z.union([queryValue, z.array(queryValue)]))
  .describe("Query parameters; an array value repeats the key");
const urlField = (description: string) => z.string().min(1).describe(description);

export const functions = [
  defineFunction({
    name: "urls/parse",
    description:
      "Break an absolute URL into protocol, credentials, host, port, path, decoded query object, hash and origin. Unicode hostnames come back as punycode.",
    input: z.object({ input: urlField("Absolute URL to parse") }),
    returns:
      "object with href, protocol, username, password, host, hostname, port, pathname, search, query, hash, origin",
    tags: ["urls", "parse", "query", "hostname", "protocol", "url"],
    examples: [
      {
        description: "Repeated query key becomes an array",
        input: { input: "https://user:pw@Example.com:8443/a/b?tag=x&tag=y&q=hello%20world#top" },
        output: {
          href: "https://user:pw@example.com:8443/a/b?tag=x&tag=y&q=hello%20world#top",
          protocol: "https",
          username: "user",
          password: "pw",
          host: "example.com:8443",
          hostname: "example.com",
          port: "8443",
          pathname: "/a/b",
          search: "?tag=x&tag=y&q=hello%20world",
          query: { tag: ["x", "y"], q: "hello world" },
          hash: "top",
          origin: "https://example.com:8443",
        },
      },
      {
        description: "Default port is omitted",
        input: { input: "http://example.com:80/" },
        output: {
          href: "http://example.com/",
          protocol: "http",
          username: "",
          password: "",
          host: "example.com",
          hostname: "example.com",
          port: null,
          pathname: "/",
          search: "",
          query: {},
          hash: "",
          origin: "http://example.com",
        },
      },
    ],
    run: (a) => parse(a.input),
  }),
  defineFunction({
    name: "urls/build",
    description:
      "Assemble a URL from hostname, protocol, port, pathname, query object and hash, percent-encoding as needed. Array query values repeat the key.",
    input: z.object({
      hostname: z.string().min(1).describe("Host such as api.example.com"),
      protocol: z
        .string()
        .regex(/^[a-z][a-z0-9+.-]*$/i, "protocol must be a scheme name without the colon")
        .default("https")
        .describe("Scheme without the colon (default https)"),
      port: z
        .union([z.number().int().min(0).max(65535), z.string().regex(/^\d{0,5}$/)])
        .optional()
        .describe("Port number; default ports are dropped"),
      pathname: z.string().optional().describe("Path such as /v1/items"),
      query: queryField.optional(),
      hash: z.string().optional().describe("Fragment without the leading #"),
    }),
    returns: "absolute URL string",
    tags: ["urls", "build", "construct", "query", "url"],
    examples: [
      {
        description: "Path, query and fragment",
        input: {
          hostname: "api.example.com",
          pathname: "/search",
          query: { q: "hello world", page: 2, tags: ["a", "b"] },
          hash: "results",
        },
        output: "https://api.example.com/search?q=hello+world&page=2&tags=a&tags=b#results",
      },
      {
        description: "Explicit protocol and port",
        input: { hostname: "localhost", protocol: "http", port: 3000 },
        output: "http://localhost:3000/",
      },
    ],
    run: (a) => build(a),
  }),
  defineFunction({
    name: "urls/setQuery",
    description:
      "Set or replace query parameters on a URL, keeping the others. A null value removes the parameter; an array repeats the key.",
    input: z.object({
      url: urlField("Absolute URL to modify"),
      query: z
        .record(z.string(), z.union([queryValue, z.array(queryValue), z.null()]))
        .describe("Parameters to set; null removes a key"),
    }),
    returns: "updated URL string",
    tags: ["urls", "query", "search", "params", "set", "remove"],
    examples: [
      {
        description: "Replace one, add one, remove one",
        input: {
          url: "https://example.com/list?page=1&sort=asc&debug=1",
          query: { page: 2, limit: 50, debug: null },
        },
        output: "https://example.com/list?page=2&sort=asc&limit=50",
      },
    ],
    run: (a) => setQuery(a.url, a.query),
  }),
  defineFunction({
    name: "urls/resolve",
    description:
      "Resolve a relative URL (path, query, fragment or protocol-relative) against a base URL, the way a browser resolves a link.",
    input: z.object({
      url: urlField("Relative or absolute URL"),
      base: urlField("Absolute base URL"),
    }),
    returns: "absolute URL string",
    tags: ["urls", "resolve", "relative", "base", "link"],
    examples: [
      {
        description: "Relative path with dot segments",
        input: { url: "../img/logo.png", base: "https://example.com/docs/guide/intro.html" },
        output: "https://example.com/docs/img/logo.png",
      },
      {
        description: "Absolute path replaces the whole path",
        input: { url: "/api?x=1", base: "https://example.com/docs/guide/" },
        output: "https://example.com/api?x=1",
      },
    ],
    run: (a) => resolve(a.url, a.base),
  }),
  defineFunction({
    name: "urls/normalize",
    description:
      "Canonicalize a URL for comparison or caching: lowercase scheme and host, drop default ports and empty query/fragment, resolve dot segments, sort query parameters.",
    input: z.object({ input: urlField("Absolute URL to normalize") }),
    returns: "normalized URL string",
    tags: ["urls", "normalize", "canonical", "dedupe", "cache-key"],
    examples: [
      {
        description: "Noisy URL",
        input: { input: "HTTPS://Example.COM:443/a/./b/../c?z=1&a=2#" },
        output: "https://example.com/a/c?a=2&z=1",
      },
      {
        description: "Unicode hostname becomes punycode",
        input: { input: "http://münchen.de/" },
        output: "http://xn--mnchen-3ya.de/",
      },
    ],
    run: (a) => normalize(a.input),
  }),
];
