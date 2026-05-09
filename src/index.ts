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

if (argv.length === 0) {
  runServer().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
} else {
  runCli(argv).then(
    (code) => process.exit(code),
    (error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    }
  );
}
