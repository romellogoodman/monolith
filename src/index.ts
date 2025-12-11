#!/usr/bin/env node
/**
 * Monolith MCP Server entry point
 */

import { runServer } from "./server.js";

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Shutting down gracefully...");
  process.exit(0);
});

// Start the server
runServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
