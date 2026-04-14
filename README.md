# Twenty CRM MCP Server

An MCP (Model Context Protocol) server for [Twenty CRM](https://twenty.com) that provides 5 generic CRUD tools for managing CRM data.

Works with any MCP client: Claude Desktop, Claude Code, Cursor, Shortwave, Cline, etc.

## Tools

| Tool | Description |
|------|-------------|
| `crm_twenty_search` | Search and list records with filtering, ordering, pagination |
| `crm_twenty_get` | Get a single record by ID |
| `crm_twenty_create` | Create a new record |
| `crm_twenty_update` | Update an existing record |
| `crm_twenty_delete` | Soft-delete a record (can be restored) |

All tools work with: `people`, `companies`, `opportunities`, `tasks`, `notes`, `attachments`, `favorites`, `timelineActivities`, `workspaceMembers`.

## Quick Start

You need a Twenty CRM API key. Find it in Twenty under **Settings → API Keys**.

### Desktop Apps (Claude Desktop, Claude Code, Cursor, etc.)

Add this to your MCP config:

```json
{
  "crm-twenty": {
    "command": "npx",
    "args": ["-y", "github:onprem-ai/mcp-crm-twenty"],
    "env": {
      "TWENTY_CRM_URL": "https://your-twenty-instance.com",
      "TWENTY_CRM_API_KEY": "your-api-key"
    }
  }
}
```

That's it — the server runs locally and connects to your Twenty CRM instance.

### Remote / Shared Setup (Shortwave, web apps, teams)

Deploy the server as a remote HTTP endpoint. Team members authenticate with their own Twenty API keys — no shared credentials needed.

**1. Start the server:**

```bash
TWENTY_CRM_URL=https://your-twenty-instance.com docker compose up -d
```

**2. Connect your MCP client to:**

```
https://your-server.com/mcp
```

When connecting, your client will open a page where you enter your personal Twenty CRM API key. This key is used directly to authenticate with Twenty — the server doesn't store it.

> Clients that support MCP OAuth (like Shortwave) handle this automatically.
> Clients that support custom headers can also pass the key directly as `Authorization: Bearer <your-api-key>`.

**Production tip:** Set `MCP_SERVER_URL` to your public URL so OAuth redirects work correctly:

```bash
TWENTY_CRM_URL=https://your-twenty-instance.com \
MCP_SERVER_URL=https://mcp.yourcompany.com \
docker compose up -d
```

## Usage Examples

**Search people:**
```json
{"resource": "people", "filter": {"name": {"firstName": {"like": "%John%"}}}, "first": 10}
```

**Get a company by ID:**
```json
{"resource": "companies", "id": "uuid-here"}
```

**Create a task:**
```json
{"resource": "tasks", "data": {"title": "Follow up", "status": "TODO", "assigneeId": "uuid"}}
```

**Update a deal stage:**
```json
{"resource": "opportunities", "id": "uuid", "data": {"stage": "WON"}}
```

## Filter Syntax

Filters use Twenty's GraphQL filter format:

- String: `{eq, neq, like, ilike, startsWith, endsWith, in, is}`
- Number: `{eq, neq, gt, gte, lt, lte, in, is}`
- Boolean: `{eq, is}`
- DateTime: `{eq, neq, gt, gte, lt, lte, is}`
- Logical: `{and: [...], or: [...], not: {...}}`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWENTY_CRM_URL` | Yes | — | Your Twenty CRM instance URL |
| `TWENTY_CRM_API_KEY` | stdio only | — | API key (not needed for HTTP mode) |
| `MCP_TRANSPORT` | No | `stdio` | Set to `http` for remote mode |
| `MCP_SERVER_URL` | No | `http://0.0.0.0:3000` | Public URL (for OAuth redirects) |
| `PORT` | No | `3000` | HTTP port |

## Architecture

Uses Twenty's GraphQL API with typed inputs for efficient field selection. The HTTP mode includes a built-in OAuth 2.1 provider so clients like Shortwave can authenticate without any external auth infrastructure — users simply enter their Twenty API key during the OAuth consent flow.

See `docs/` for the design spec and implementation plan.
