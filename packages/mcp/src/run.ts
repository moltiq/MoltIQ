import { runMcpServer } from "./server.js";

runMcpServer().catch((err) => {
  process.stderr.write(`MoltIQ MCP fatal: ${err}\n`);
  process.exit(1);
});
