#!/usr/bin/env node
/**
 * Monolith entry point — dispatches between MCP stdio server and CLI
 * based on whether argv is present.
 */

import { runServer } from "./server.js";
import { runCli } from "./cli.js";

process.on("SIGINT", () => {
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});

const argv = process.argv.slice(2);

function fail(error: unknown): never {
  console.error("Fatal error:", error);
  process.exit(1);
}

if (argv.length > 0) {
  runCli(argv).then((code) => process.exit(code), fail);
} else if (process.stdin.isTTY) {
  // Human at a shell — show CLI help instead of hanging on stdio.
  runCli(["--help"]).then((code) => process.exit(code), fail);
} else {
  // Piped stdin (MCP client) — run as stdio server.
  runServer().catch(fail);
}
