import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { TwentyClient } from "./client.js";
import { createMcpServer } from "./server.js";
import { createAuthHandler, extractBearerToken } from "./auth.js";

interface Session {
  transport: StreamableHTTPServerTransport;
}

export async function startHttpServer(crmUrl: string, port: number) {
  const serverUrl = `http://0.0.0.0:${port}`;
  const sessions = new Map<string, Session>();
  const handleAuth = createAuthHandler({ serverUrl: process.env.MCP_SERVER_URL ?? serverUrl });

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Try auth routes first (metadata, register, authorize, token)
    const handled = await handleAuth(req, res);
    if (handled) return;

    const url = new URL(req.url ?? "/", serverUrl);
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
      return;
    }

    // --- MCP endpoint: require bearer token ---
    const apiKey = extractBearerToken(req);
    if (!apiKey) {
      const metadataUrl = `${process.env.MCP_SERVER_URL ?? serverUrl}/.well-known/oauth-protected-resource`;
      res.writeHead(401, {
        "WWW-Authenticate": `Bearer realm="crm-twenty", resource_metadata="${metadataUrl}"`,
      });
      res.end();
      return;
    }

    // --- Route by session ---
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      let session: Session | undefined;

      if (sessionId) {
        session = sessions.get(sessionId);
      }

      if (!session && isInitializeRequest(body)) {
        // New session — create per-session client + server
        const client = new TwentyClient(crmUrl, apiKey);
        const mcpServer = createMcpServer(client);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport });
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      if (!session) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        }));
        return;
      }

      await session.transport.handleRequest(req, res, body);
    } else if (req.method === "GET") {
      // SSE stream for notifications
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid or missing session ID");
        return;
      }
      await sessions.get(sessionId)!.transport.handleRequest(req, res);
    } else if (req.method === "DELETE") {
      // Session termination
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.transport.handleRequest(req, res);
        sessions.delete(sessionId);
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid or missing session ID");
      }
    } else {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method not allowed");
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.error(`Twenty CRM MCP server (HTTP) listening on port ${port}`);
    console.error(`MCP endpoint: ${process.env.MCP_SERVER_URL ?? serverUrl}/mcp`);
    console.error(`OAuth metadata: ${process.env.MCP_SERVER_URL ?? serverUrl}/.well-known/oauth-protected-resource`);
  });
}
