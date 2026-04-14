# Twenty CRM MCP Plugin — Design Spec

## Goal

Build an MCP plugin for Twenty CRM that works efficiently with small-to-medium models (Sonnet, Llama 70B class). Minimize tool count and token overhead while covering general-purpose CRM assistant workflows.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Use case | General-purpose CRM assistant | Day-to-day sales ops: contacts, companies, deals, tasks, notes |
| Tool style | Stateless, self-contained calls | Each tool is a single operation, no chaining required |
| Model target | 10-20 tools, moderate complexity | Sweet spot for Sonnet/70B class models |
| Tool design | Generic CRUD (Approach C) | 5 tools with `resource` param, not per-resource tools |
| Backend API | GraphQL (primary) | Uniform endpoint, field selection, consistent filters |
| Fallback | REST (documented) | If GraphQL proves problematic, switch to REST OpenAPI |
| Language | TypeScript + @modelcontextprotocol/sdk | Matches project stack, official SDK |
| Location | `plugins/crm-twenty/` in marketplace repo | Standard plugin structure |
| Tool prefix | `crm_twenty_*` | Domain-first naming for better tool selection |

## Plugin Structure

```
plugins/crm-twenty/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── skills/
│   └── crm-twenty/
│       └── SKILL.md              # Resource guide for the agent
├── mcp/
│   ├── package.json
│   ├── tsconfig.json
│   ├── index.ts                  # MCP server entry point
│   ├── client.ts                 # GraphQL client (auth, request)
│   ├── resources.ts              # Resource definitions (fields, defaults)
│   ├── tools/
│   │   ├── search.ts             # crm_twenty_search
│   │   ├── get.ts                # crm_twenty_get
│   │   ├── create.ts             # crm_twenty_create
│   │   ├── update.ts             # crm_twenty_update
│   │   └── delete.ts             # crm_twenty_delete
│   └── graphql/
│       └── builder.ts            # Dynamic GraphQL query/mutation builder
├── external/                     # Raw schemas (reference only, not shipped)
│   ├── core.json
│   ├── metadata.json
│   ├── crm-graphql-core-schema.graphql
│   └── crm-graphql-metadata-schema.graphql
└── docs/
    └── rest-fallback.md          # Notes on switching to REST if needed
```

## MCP Tools

### 1. `crm_twenty_search`

List, filter, and search records with pagination.

```typescript
{
  name: "crm_twenty_search",
  description: "Search and list CRM records with filtering, ordering, and pagination",
  inputSchema: {
    type: "object",
    properties: {
      resource: {
        type: "string",
        enum: ["people", "companies", "opportunities", "tasks", "notes",
               "attachments", "favorites", "timelineActivities", "workspaceMembers"],
        description: "The CRM resource type to search"
      },
      filter: {
        type: "object",
        description: "Filter criteria. Keys are field names, values are filter objects (e.g. {name: {like: '%John%'}, city: {eq: 'Berlin'}}). Supports and/or/not for complex queries."
      },
      orderBy: {
        type: "object",
        description: "Sort order. Keys are field names, values are 'AscNullsFirst' | 'AscNullsLast' | 'DescNullsFirst' | 'DescNullsLast'"
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "Fields to return. If omitted, returns default fields for the resource."
      },
      first: {
        type: "integer",
        description: "Number of records to return (default: 20, max: 100)"
      },
      after: {
        type: "string",
        description: "Cursor for pagination. Pass the endCursor from a previous response."
      }
    },
    required: ["resource"]
  }
}
```

**GraphQL mapping:** Builds a query like:
```graphql
query {
  people(first: 20, filter: {...}, orderBy: {...}) {
    totalCount
    edges {
      node { id name { firstName lastName } emails { primaryEmail } ... }
      cursor
    }
    pageInfo { endCursor hasNextPage }
  }
}
```

### 2. `crm_twenty_get`

Get a single record by ID with optional field selection.

```typescript
{
  name: "crm_twenty_get",
  description: "Get a single CRM record by ID",
  inputSchema: {
    type: "object",
    properties: {
      resource: {
        type: "string",
        enum: ["people", "companies", "opportunities", "tasks", "notes",
               "attachments", "favorites", "timelineActivities", "workspaceMembers"],
        description: "The CRM resource type"
      },
      id: {
        type: "string",
        description: "The record UUID"
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "Fields to return. If omitted, returns default fields for the resource."
      }
    },
    required: ["resource", "id"]
  }
}
```

**GraphQL mapping:** Uses the singular query with an ID filter:
```graphql
query {
  person(filter: { id: { eq: "uuid" } }) {
    id name { firstName lastName } emails { primaryEmail } ...
  }
}
```

### 3. `crm_twenty_create`

Create a new record.

```typescript
{
  name: "crm_twenty_create",
  description: "Create a new CRM record",
  inputSchema: {
    type: "object",
    properties: {
      resource: {
        type: "string",
        enum: ["people", "companies", "opportunities", "tasks", "notes",
               "attachments", "favorites", "timelineActivities", "workspaceMembers"],
        description: "The CRM resource type to create"
      },
      data: {
        type: "object",
        description: "Record data. Fields depend on resource type — see skill guide for available fields."
      }
    },
    required: ["resource", "data"]
  }
}
```

**GraphQL mapping:**
```graphql
mutation {
  createPerson(data: { name: { firstName: "John", lastName: "Doe" }, ... }) {
    id name { firstName lastName } ...
  }
}
```

### 4. `crm_twenty_update`

Update an existing record.

```typescript
{
  name: "crm_twenty_update",
  description: "Update an existing CRM record",
  inputSchema: {
    type: "object",
    properties: {
      resource: {
        type: "string",
        enum: ["people", "companies", "opportunities", "tasks", "notes",
               "attachments", "favorites", "timelineActivities", "workspaceMembers"],
        description: "The CRM resource type to update"
      },
      id: {
        type: "string",
        description: "The record UUID to update"
      },
      data: {
        type: "object",
        description: "Fields to update. Only include fields you want to change."
      }
    },
    required: ["resource", "id", "data"]
  }
}
```

**GraphQL mapping:**
```graphql
mutation {
  updatePerson(id: "uuid", data: { jobTitle: "CTO" }) {
    id name { firstName lastName } jobTitle ...
  }
}
```

### 5. `crm_twenty_delete`

Soft-delete a record (can be restored).

```typescript
{
  name: "crm_twenty_delete",
  description: "Delete a CRM record (soft delete, can be restored)",
  inputSchema: {
    type: "object",
    properties: {
      resource: {
        type: "string",
        enum: ["people", "companies", "opportunities", "tasks", "notes",
               "attachments", "favorites", "timelineActivities", "workspaceMembers"],
        description: "The CRM resource type to delete"
      },
      id: {
        type: "string",
        description: "The record UUID to delete"
      }
    },
    required: ["resource", "id"]
  }
}
```

**GraphQL mapping:**
```graphql
mutation {
  deletePerson(id: "uuid") { id deletedAt }
}
```

## Resource Definitions

The MCP server maintains a resource registry that maps resource names to their GraphQL types, query/mutation names, and default fields. This avoids hardcoding GraphQL strings per resource.

### Resource Registry (resources.ts)

```typescript
interface ResourceDef {
  singular: string;          // "person"
  plural: string;            // "people"
  queryPlural: string;       // "people" (GraphQL query name)
  querySingular: string;     // "person"
  createMutation: string;    // "createPerson"
  updateMutation: string;    // "updatePerson"
  deleteMutation: string;    // "deletePerson"
  defaultFields: string;     // GraphQL field selection string
}
```

### Default Fields Per Resource

Each resource gets a curated set of default fields — enough for the model to work with, small enough to keep responses compact.

**people:**
```
id name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber }
jobTitle city avatarUrl companyId createdAt updatedAt
```

**companies:**
```
id name domainName { primaryLinkUrl } address { addressCity addressCountry }
employees linkedinLink { primaryLinkUrl } annualRecurringRevenue { amountMicros currencyCode }
idealCustomerProfile accountOwnerId createdAt updatedAt
```

**opportunities:**
```
id name amount { amountMicros currencyCode } closeDate stage
companyId pointOfContactId ownerId position createdAt updatedAt
```

**tasks:**
```
id title status dueAt assigneeId position createdAt updatedAt
```

**notes:**
```
id title bodyV2 position createdAt updatedAt
```

**attachments:**
```
id name fullPath fileCategory
targetPersonId targetCompanyId targetOpportunityId targetTaskId targetNoteId
createdAt updatedAt
```

**favorites:**
```
id companyId personId opportunityId taskId noteId position createdAt
```

**timelineActivities:**
```
id happensAt name properties linkedRecordCachedName linkedRecordId
targetCompanyId targetPersonId targetOpportunityId targetTaskId targetNoteId
createdAt
```

**workspaceMembers:**
```
id name { firstName lastName } userEmail avatarUrl locale timeZone createdAt updatedAt
```

## SKILL.md Design

The skill serves as the routing layer — it tells the model what resources exist, what fields they have, and how to filter them. This is where domain knowledge lives, keeping it out of tool descriptions (which must stay compact).

The skill should cover:
1. Available resources and their purpose
2. Key fields per resource (create/update/filter)
3. Filter syntax with examples
4. Common workflows (e.g., "find contact → create note → link to contact")
5. Pagination guidance

## GraphQL Client (client.ts)

Thin wrapper around fetch:
- Base URL from env: `TWENTY_CRM_URL` (e.g., `https://your-twenty-instance.com`)
- Auth from env: `TWENTY_CRM_API_KEY`
- Single `query(operationName, query, variables)` method
- Error handling: surface GraphQL errors in tool response
- Endpoint: `${TWENTY_CRM_URL}/graphql`

## GraphQL Builder (graphql/builder.ts)

Dynamically constructs GraphQL queries/mutations from tool params:

```typescript
function buildSearchQuery(resource: ResourceDef, params: SearchParams): string
function buildGetQuery(resource: ResourceDef, id: string, fields?: string[]): string
function buildCreateMutation(resource: ResourceDef, data: object): string
function buildUpdateMutation(resource: ResourceDef, id: string, data: object): string
function buildDeleteMutation(resource: ResourceDef, id: string): string
```

Each function:
1. Looks up the resource definition
2. Builds the appropriate GraphQL operation
3. Uses custom `fields` if provided, otherwise falls back to `defaultFields`
4. Returns the query string + variables object

## .mcp.json Configuration

```json
{
  "crm-twenty": {
    "command": "npx",
    "args": ["tsx", "./plugins/crm-twenty/mcp/index.ts"],
    "env": {
      "TWENTY_CRM_URL": "${TWENTY_CRM_URL}",
      "TWENTY_CRM_API_KEY": "${TWENTY_CRM_API_KEY}"
    }
  }
}
```

Note: For production, this would point to a compiled JS entry point. During development, `tsx` allows running TypeScript directly.

## REST Fallback Strategy

If GraphQL proves problematic (auth issues, missing fields, instability), the MCP server can be switched to REST:

- The OpenAPI specs (`core.json`, `metadata.json`) document all REST endpoints
- Each resource has 7 consistent REST endpoints: list, batch create, get by ID, find duplicates, restore by ID, batch restore, merge
- The `resources.ts` registry would add REST path mappings
- The builder would construct fetch calls instead of GraphQL queries
- Tool interfaces stay identical — the switch is internal to the MCP server

See `docs/rest-fallback.md` for detailed mapping.

## Out of Scope (for now)

- Metadata API (custom objects, fields, views) — admin, not day-to-day
- Message/email resources — complex, needs separate design
- Calendar resources — complex, needs separate integration
- Workflow resources — admin/automation, not CRM assistant
- Hard delete (destroy) — too destructive for assistant use
- Batch operations — can be added later if needed
- GraphQL subscriptions — not needed for request/response MCP tools
