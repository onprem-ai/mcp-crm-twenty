# Twenty CRM MCP Server

An MCP (Model Context Protocol) server for [Twenty CRM](https://twenty.com) that gives AI agents full access to your CRM data through 14 tools - search, create, bulk operations, full-text search, analytics, and more.

Works with any MCP client: Claude Code, Claude Desktop, Cursor, Shortwave, Cline, etc.

## Why this one?

Most Twenty MCP integrations are thin wrappers around the REST API. This one uses Twenty's GraphQL API directly, which means:

- **Efficient field selection** - only fetches the fields you need, not entire records
- **Nested relation traversal** - get a company with its people in a single query
- **Full filter syntax** - the complete Twenty GraphQL filter language, not a simplified subset
- **Bulk operations** - create, update, or delete up to 100 records in one call
- **Schema introspection** - agents can discover available fields at runtime
- **Clickable URLs** - every returned record includes a direct link to the Twenty UI

## Quick Start

You need a Twenty CRM API key. Find it in Twenty under **Settings -> API Keys**.

### Claude Code

```bash
claude mcp add crm-twenty \
  -e TWENTY_CRM_URL=https://your-twenty-instance.com \
  -e TWENTY_CRM_API_KEY=your-api-key \
  -- npx -y github:onprem-ai/mcp-crm-twenty
```

### Claude Desktop / Cursor / other MCP clients

Add to your MCP config:

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

That's it - the server runs locally and connects to your Twenty CRM instance.

### Remote / Shared Setup (Shortwave, web apps, teams)

Deploy the server as a remote HTTP endpoint. Team members authenticate with their own Twenty API keys - no shared credentials needed.

**1. Start the server:**

```bash
TWENTY_CRM_URL=https://your-twenty-instance.com docker compose up -d
```

**2. Connect your MCP client to:**

```
https://your-server.com/mcp
```

When connecting, your client will open a page where you enter your personal Twenty CRM API key. This key is used directly to authenticate with Twenty - the server doesn't store it.

> Clients that support MCP OAuth (like Shortwave) handle this automatically.
> Clients that support custom headers can also pass the key directly as `Authorization: Bearer <your-api-key>`.

**Production tip:** Set `MCP_SERVER_URL` to your public URL so OAuth redirects work correctly:

```bash
TWENTY_CRM_URL=https://your-twenty-instance.com \
MCP_SERVER_URL=https://mcp.yourcompany.com \
docker compose up -d
```

## Tools

| Tool | Description |
|------|-------------|
| `crm_twenty_search` | Search and list records with filtering, ordering, pagination |
| `crm_twenty_fulltext_search` | Search across all record types by text |
| `crm_twenty_get` | Get a single record by ID |
| `crm_twenty_create` | Create a new record (supports upsert) |
| `crm_twenty_bulk_create` | Create up to 100 records in one call |
| `crm_twenty_update` | Update an existing record |
| `crm_twenty_bulk_update` | Update all records matching a filter |
| `crm_twenty_delete` | Soft-delete a record |
| `crm_twenty_bulk_delete` | Soft-delete all records matching a filter |
| `crm_twenty_restore` | Restore a soft-deleted record |
| `crm_twenty_duplicates` | Check for duplicate people or companies |
| `crm_twenty_group_by` | Aggregate records grouped by fields |
| `crm_twenty_schema` | Discover available fields for any resource |

All tools work with: `people`, `companies`, `opportunities`, `tasks`, `notes`, `noteTargets`, `taskTargets`, `attachments`, `favorites`, `timelineActivities`, `workspaceMembers`.

## Usage Examples

**Search people:**
```json
{"resource": "people", "filter": {"name": {"firstName": {"like": "%John%"}}}, "first": 10}
```

**Get a company with its contacts:**
```json
{"resource": "companies", "id": "uuid", "fields": ["id", "name", "people { id name { firstName lastName } }"]}
```

**Bulk create contacts:**
```json
{"resource": "people", "data": [{"name": {"firstName": "Jane", "lastName": "Doe"}, "emails": {"primaryEmail": "jane@example.com"}}], "upsert": true}
```

**Aggregate deals by stage:**
```json
{"resource": "opportunities", "groupBy": [{"stage": true}]}
```

**Full-text search:**
```json
{"searchInput": "GPU server"}
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
| `TWENTY_CRM_URL` | Yes | - | Your Twenty CRM instance URL |
| `TWENTY_CRM_API_KEY` | stdio only | - | API key (not needed for HTTP mode) |
| `MCP_TRANSPORT` | No | `stdio` | Set to `http` for remote mode |
| `MCP_SERVER_URL` | No | `http://0.0.0.0:3000` | Public URL (for OAuth redirects) |
| `PORT` | No | `3000` | HTTP port |

## Architecture

Uses Twenty's GraphQL API with typed inputs for efficient field selection. The HTTP mode includes a built-in OAuth 2.1 provider so clients like Shortwave can authenticate without any external auth infrastructure - users simply enter their Twenty API key during the OAuth consent flow.

See `docs/` for the design spec and implementation plan.
