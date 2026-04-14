# Twenty CRM MCP Server

An MCP (Model Context Protocol) server for [Twenty CRM](https://twenty.com) that provides 5 generic CRUD tools for managing CRM data.

Works with any MCP client: Claude Desktop, Claude Code, Cursor, Cline, etc.

## Tools

| Tool | Description |
|------|-------------|
| `crm_twenty_search` | Search and list records with filtering, ordering, pagination |
| `crm_twenty_get` | Get a single record by ID |
| `crm_twenty_create` | Create a new record |
| `crm_twenty_update` | Update an existing record |
| `crm_twenty_delete` | Soft-delete a record (can be restored) |

All tools use a `resource` parameter to specify the entity type: `people`, `companies`, `opportunities`, `tasks`, `notes`, `attachments`, `favorites`, `timelineActivities`, `workspaceMembers`.

## Setup

### Environment Variables

```bash
export TWENTY_CRM_URL="https://your-twenty-instance.com"
export TWENTY_CRM_API_KEY="your-api-key"
```

### MCP Config

Add to your MCP config (Claude Desktop, Claude Code, Shortwave, Cursor, etc.):

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

### Docker

```json
{
  "crm-twenty": {
    "command": "docker",
    "args": ["run", "-i", "--rm",
      "-e", "TWENTY_CRM_URL", "-e", "TWENTY_CRM_API_KEY",
      "ghcr.io/onprem-ai/mcp-crm-twenty:latest"],
    "env": {
      "TWENTY_CRM_URL": "https://your-twenty-instance.com",
      "TWENTY_CRM_API_KEY": "your-api-key"
    }
  }
}
```

Or with Docker Compose:

```bash
TWENTY_CRM_URL=https://your-twenty-instance.com TWENTY_CRM_API_KEY=your-key docker compose up
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

## Architecture

Uses Twenty's GraphQL API with typed inputs for efficient field selection. See `docs/` for the design spec and implementation plan.
