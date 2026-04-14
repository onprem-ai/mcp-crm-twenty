import { randomUUID, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

// In-memory stores
const clients = new Map<string, { client_id: string; redirect_uris: string[] }>();
const authCodes = new Map<string, { apiKey: string; clientId: string; redirectUri: string; expiresAt: number }>();

interface AuthConfig {
  serverUrl: string;
}

/** Parse URL-encoded body from a request */
async function parseFormBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

/** Parse JSON body from a request */
async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString());
}

/** Send JSON response */
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Create OAuth route handler.
 * Handles: metadata endpoints, dynamic client registration, authorize, and token exchange.
 * Returns true if the request was handled, false otherwise.
 */
export function createAuthHandler(config: AuthConfig) {
  const { serverUrl } = config;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", serverUrl);
    const path = url.pathname;

    // --- Protected Resource Metadata (RFC 9728) ---
    if (path === "/.well-known/oauth-protected-resource" && req.method === "GET") {
      json(res, 200, {
        resource: serverUrl,
        authorization_servers: [serverUrl],
        scopes_supported: ["mcp:tools"],
      });
      return true;
    }

    // --- Authorization Server Metadata (RFC 8414) ---
    if (path === "/.well-known/oauth-authorization-server" && req.method === "GET") {
      json(res, 200, {
        issuer: serverUrl,
        authorization_endpoint: `${serverUrl}/authorize`,
        token_endpoint: `${serverUrl}/token`,
        registration_endpoint: `${serverUrl}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
        scopes_supported: ["mcp:tools"],
        code_challenge_methods_supported: ["S256"],
      });
      return true;
    }

    // --- Dynamic Client Registration (RFC 7591) ---
    if (path === "/register" && req.method === "POST") {
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const clientId = randomUUID();
      const redirectUris = (body.redirect_uris as string[]) ?? [];
      clients.set(clientId, { client_id: clientId, redirect_uris: redirectUris });
      json(res, 201, {
        client_id: clientId,
        redirect_uris: redirectUris,
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      });
      return true;
    }

    // --- Authorization Endpoint ---
    if (path === "/authorize" && req.method === "GET") {
      const clientId = url.searchParams.get("client_id") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const codeChallenge = url.searchParams.get("code_challenge") ?? "";
      const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "";

      // Serve consent page — user enters their Twenty CRM API key
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Twenty CRM – Connect</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 2rem; max-width: 420px; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    label { display: block; font-weight: 500; margin-bottom: 0.5rem; font-size: 0.9rem; }
    input[type="password"] { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; }
    button { width: 100%; padding: 0.7rem; background: #111; color: white; border: none; border-radius: 6px; font-size: 0.95rem; cursor: pointer; margin-top: 1rem; }
    button:hover { background: #333; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect to Twenty CRM</h1>
    <p>Enter your Twenty CRM API key to authorize access. You can find it in Twenty under Settings → API Keys.</p>
    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}">
      <label for="api_key">Twenty CRM API Key</label>
      <input type="password" id="api_key" name="api_key" required placeholder="eyJhbGciOi...">
      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>`);
      return true;
    }

    if (path === "/authorize" && req.method === "POST") {
      const body = await parseFormBody(req);
      const apiKey = body.get("api_key") ?? "";
      const redirectUri = body.get("redirect_uri") ?? "";
      const state = body.get("state") ?? "";
      const clientId = body.get("client_id") ?? "";

      if (!apiKey) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("API key is required");
        return true;
      }

      // Generate auth code that maps to the API key
      const code = randomBytes(32).toString("hex");
      authCodes.set(code, {
        apiKey,
        clientId,
        redirectUri,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (state) redirect.searchParams.set("state", state);

      res.writeHead(302, { Location: redirect.toString() });
      res.end();
      return true;
    }

    // --- Token Endpoint ---
    if (path === "/token" && req.method === "POST") {
      const body = await parseFormBody(req);
      const grantType = body.get("grant_type");
      const code = body.get("code") ?? "";

      if (grantType !== "authorization_code") {
        json(res, 400, { error: "unsupported_grant_type" });
        return true;
      }

      const stored = authCodes.get(code);
      if (!stored || stored.expiresAt < Date.now()) {
        authCodes.delete(code);
        json(res, 400, { error: "invalid_grant" });
        return true;
      }

      authCodes.delete(code);

      // The access token IS the Twenty API key
      json(res, 200, {
        access_token: stored.apiKey,
        token_type: "Bearer",
        scope: "mcp:tools",
      });
      return true;
    }

    return false;
  };
}

/** Extract bearer token from Authorization header */
export function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
