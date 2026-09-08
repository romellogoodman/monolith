#!/usr/bin/env node
/**
 * Entry point. argv present → CLI; argv empty + piped stdin → MCP stdio
 * server; argv empty + TTY → CLI help.
 */

import { runServer } from "./server.js";
import { runCli } from "./cli.js";

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const argv = process.argv.slice(2);

function fail(error: unknown): void {
  console.error("Fatal error:", error);
  process.exitCode = 1;
}

if (argv.length > 0 || process.stdin.isTTY) {
  // Set exitCode instead of calling process.exit() so a large stdout write
  // is flushed before the process ends (pipes are asynchronous on macOS).
  runCli(argv.length > 0 ? argv : ["--help"]).then((code) => {
    process.exitCode = code;
  }, fail);
} else {
  runServer().catch(fail);
}
