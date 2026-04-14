#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TwentyClient } from "./client.js";
import { createMcpServer } from "./server.js";
import { startHttpServer } from "./http.js";

async function main() {
  const transport = process.env.MCP_TRANSPORT ?? "stdio";
  const crmUrl = process.env.TWENTY_CRM_URL;

  if (!crmUrl) {
    throw new Error("TWENTY_CRM_URL environment variable is required");
  }

  if (transport === "http") {
    const port = parseInt(process.env.PORT ?? "3000", 10);
    await startHttpServer(crmUrl, port);
  } else {
    // stdio mode — API key from env var
    const apiKey = process.env.TWENTY_CRM_API_KEY;
    if (!apiKey) {
      throw new Error("TWENTY_CRM_API_KEY environment variable is required for stdio transport");
    }
    const client = new TwentyClient(crmUrl, apiKey);
    const server = createMcpServer(client);
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("Twenty CRM MCP server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
