# REST Fallback Strategy

If the GraphQL API proves problematic, the MCP server can be switched to REST.

## Why switch?

- GraphQL endpoint returns unexpected errors or auth issues
- Need features only available in REST (e.g., batch operations, merge, duplicates)
- GraphQL schema changes break queries

## How to switch

1. In `client.ts`, replace the GraphQL fetch with REST fetch calls
2. In `graphql/builder.ts`, replace query builders with REST URL + body builders
3. Tool interfaces in `index.ts` stay identical — only the internal plumbing changes

## REST endpoint patterns (from core.json OpenAPI spec)

Each resource has 7 consistent endpoints:

| Operation | Method | Path | Notes |
|-----------|--------|------|-------|
| List | GET | `/{resource}` | Query params for filter, orderBy, first, after |
| Get by ID | GET | `/{resource}/{id}` | Returns single record |
| Create (batch) | POST | `/batch/{resource}` | Body: array of records |
| Find duplicates | POST | `/{resource}/duplicates` | |
| Restore by ID | POST | `/restore/{resource}/{id}` | Undo soft delete |
| Batch restore | POST | `/restore/{resource}` | |
| Merge | POST | `/{resource}/merge` | People & companies only |

## Resource path mapping

| Tool resource param | REST path segment |
|---------------------|-------------------|
| people | /people |
| companies | /companies |
| opportunities | /opportunities |
| tasks | /tasks |
| notes | /notes |
| attachments | /attachments |
| favorites | /favorites |
| timelineActivities | /timelineActivities |
| workspaceMembers | /workspaceMembers |

## Authentication

Same as GraphQL: `Authorization: Bearer {TWENTY_CRM_API_KEY}`

Base URL: `{TWENTY_CRM_URL}/rest` (note: `/rest` prefix, not `/graphql`)

---

Commit command:
```bash
git add plugins/crm-twenty/docs/rest-fallback.md
git commit -m "docs(crm-twenty): add REST fallback strategy"
```
