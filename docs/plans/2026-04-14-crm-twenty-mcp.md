# Twenty CRM MCP Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP plugin for Twenty CRM with 5 generic CRUD tools, a skill routing layer, and a GraphQL backend — optimized for small-to-medium models.

**Architecture:** A TypeScript MCP server using `@modelcontextprotocol/sdk` with stdio transport. Five tools (`crm_twenty_search`, `crm_twenty_get`, `crm_twenty_create`, `crm_twenty_update`, `crm_twenty_delete`) map to dynamically-built GraphQL queries/mutations against Nine's REST/GraphQL API. A SKILL.md describes resources and fields so models know what to pass without reading the full schema.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod`, `tsx` (dev runner), Twenty CRM GraphQL API

---

## File Structure

```
plugins/crm-twenty/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # MCP server config (stdio, env vars)
├── skills/
│   └── crm-twenty/
│       └── SKILL.md             # Resource guide for the agent
├── mcp/
│   ├── package.json             # npm package with deps
│   ├── tsconfig.json            # TypeScript config
│   ├── index.ts                 # MCP server entry point (registers tools, connects transport)
│   ├── client.ts                # GraphQL HTTP client (auth, request, error handling)
│   ├── resources.ts             # Resource registry (names, fields, GraphQL mappings)
│   └── graphql/
│       └── builder.ts           # Dynamic GraphQL query/mutation string builder
├── external/                    # Raw schemas (already exists, reference only)
│   ├── core.json
│   ├── metadata.json
│   ├── crm-graphql-core-schema.graphql
│   └── crm-graphql-metadata-schema.graphql
└── docs/
    └── rest-fallback.md         # Notes on switching to REST
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `plugins/crm-twenty/mcp/package.json`
- Create: `plugins/crm-twenty/mcp/tsconfig.json`
- Create: `plugins/crm-twenty/.claude-plugin/plugin.json`
- Create: `plugins/crm-twenty/.mcp.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "crm-twenty-mcp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create plugin.json**

```json
{
  "name": "crm-twenty",
  "description": "Twenty CRM integration with search, create, update, and delete operations",
  "version": "1.0.0",
  "keywords": ["crm", "twenty", "sales", "contacts", "companies", "deals"],
  "skills": "./skills/"
}
```

- [ ] **Step 4: Create .mcp.json**

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

- [ ] **Step 5: Install dependencies**

Run: `cd plugins/crm-twenty/mcp && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 6: Commit**

```bash
git add plugins/crm-twenty/mcp/package.json plugins/crm-twenty/mcp/tsconfig.json plugins/crm-twenty/mcp/package-lock.json plugins/crm-twenty/.claude-plugin/plugin.json plugins/crm-twenty/.mcp.json
git commit -m "feat(crm-twenty): scaffold MCP plugin package"
```

---

### Task 2: Resource Registry

**Files:**
- Create: `plugins/crm-twenty/mcp/resources.ts`

- [ ] **Step 1: Create the resource registry**

This file defines all 9 resources with their GraphQL names and default field selections. This is the single source of truth for mapping tool `resource` params to GraphQL operations.

```typescript
export interface ResourceDef {
  singular: string;
  plural: string;
  querySingular: string;
  queryPlural: string;
  createMutation: string;
  updateMutation: string;
  deleteMutation: string;
  defaultFields: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  people: {
    singular: "person",
    plural: "people",
    querySingular: "person",
    queryPlural: "people",
    createMutation: "createPerson",
    updateMutation: "updatePerson",
    deleteMutation: "deletePerson",
    defaultFields: `id name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber } jobTitle city avatarUrl companyId createdAt updatedAt`,
  },
  companies: {
    singular: "company",
    plural: "companies",
    querySingular: "company",
    queryPlural: "companies",
    createMutation: "createCompany",
    updateMutation: "updateCompany",
    deleteMutation: "deleteCompany",
    defaultFields: `id name domainName { primaryLinkUrl } address { addressCity addressCountry } employees linkedinLink { primaryLinkUrl } annualRecurringRevenue { amountMicros currencyCode } idealCustomerProfile accountOwnerId createdAt updatedAt`,
  },
  opportunities: {
    singular: "opportunity",
    plural: "opportunities",
    querySingular: "opportunity",
    queryPlural: "opportunities",
    createMutation: "createOpportunity",
    updateMutation: "updateOpportunity",
    deleteMutation: "deleteOpportunity",
    defaultFields: `id name amount { amountMicros currencyCode } closeDate stage companyId pointOfContactId ownerId position createdAt updatedAt`,
  },
  tasks: {
    singular: "task",
    plural: "tasks",
    querySingular: "task",
    queryPlural: "tasks",
    createMutation: "createTask",
    updateMutation: "updateTask",
    deleteMutation: "deleteTask",
    defaultFields: `id title status dueAt assigneeId position createdAt updatedAt`,
  },
  notes: {
    singular: "note",
    plural: "notes",
    querySingular: "note",
    queryPlural: "notes",
    createMutation: "createNote",
    updateMutation: "updateNote",
    deleteMutation: "deleteNote",
    defaultFields: `id title bodyV2 position createdAt updatedAt`,
  },
  attachments: {
    singular: "attachment",
    plural: "attachments",
    querySingular: "attachment",
    queryPlural: "attachments",
    createMutation: "createAttachment",
    updateMutation: "updateAttachment",
    deleteMutation: "deleteAttachment",
    defaultFields: `id name fullPath fileCategory targetPersonId targetCompanyId targetOpportunityId targetTaskId targetNoteId createdAt updatedAt`,
  },
  favorites: {
    singular: "favorite",
    plural: "favorites",
    querySingular: "favorite",
    queryPlural: "favorites",
    createMutation: "createFavorite",
    updateMutation: "updateFavorite",
    deleteMutation: "deleteFavorite",
    defaultFields: `id companyId personId opportunityId taskId noteId position createdAt`,
  },
  timelineActivities: {
    singular: "timelineActivity",
    plural: "timelineActivities",
    querySingular: "timelineActivity",
    queryPlural: "timelineActivities",
    createMutation: "createTimelineActivity",
    updateMutation: "updateTimelineActivity",
    deleteMutation: "deleteTimelineActivity",
    defaultFields: `id happensAt name properties linkedRecordCachedName linkedRecordId targetCompanyId targetPersonId targetOpportunityId targetTaskId targetNoteId createdAt`,
  },
  workspaceMembers: {
    singular: "workspaceMember",
    plural: "workspaceMembers",
    querySingular: "workspaceMember",
    queryPlural: "workspaceMembers",
    createMutation: "createWorkspaceMember",
    updateMutation: "updateWorkspaceMember",
    deleteMutation: "deleteWorkspaceMember",
    defaultFields: `id name { firstName lastName } userEmail avatarUrl locale timeZone createdAt updatedAt`,
  },
};

export const RESOURCE_NAMES = Object.keys(RESOURCES) as readonly string[];

export function getResource(name: string): ResourceDef {
  const resource = RESOURCES[name];
  if (!resource) {
    throw new Error(`Unknown resource: ${name}. Valid resources: ${RESOURCE_NAMES.join(", ")}`);
  }
  return resource;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/crm-twenty/mcp && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/crm-twenty/mcp/resources.ts
git commit -m "feat(crm-twenty): add resource registry with 9 CRM resources"
```

---

### Task 3: GraphQL Client

**Files:**
- Create: `plugins/crm-twenty/mcp/client.ts`

- [ ] **Step 1: Create the GraphQL client**

```typescript
export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

export class TwentyClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const url = process.env.TWENTY_CRM_URL;
    const key = process.env.TWENTY_CRM_API_KEY;

    if (!url) throw new Error("TWENTY_CRM_URL environment variable is required");
    if (!key) throw new Error("TWENTY_CRM_API_KEY environment variable is required");

    this.baseUrl = url.replace(/\/$/, "");
    this.apiKey = key;
  }

  async query<T = unknown>(
    operationName: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ operationName, query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Twenty API HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors?.length) {
      const messages = result.errors.map((e) => e.message).join("; ");
      throw new Error(`Twenty GraphQL error: ${messages}`);
    }

    if (!result.data) {
      throw new Error("Twenty API returned no data");
    }

    return result.data;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/crm-twenty/mcp && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/crm-twenty/mcp/client.ts
git commit -m "feat(crm-twenty): add GraphQL client with auth and error handling"
```

---

### Task 4: GraphQL Query Builder

**Files:**
- Create: `plugins/crm-twenty/mcp/graphql/builder.ts`

- [ ] **Step 1: Create the builder**

This module dynamically constructs GraphQL query/mutation strings from tool parameters and resource definitions.

```typescript
import { type ResourceDef } from "../resources.js";

export interface SearchParams {
  filter?: Record<string, unknown>;
  orderBy?: Record<string, string>;
  fields?: string[];
  first?: number;
  after?: string;
}

export interface QueryResult {
  query: string;
  variables: Record<string, unknown>;
  operationName: string;
  resultKey: string;
}

function resolveFields(resource: ResourceDef, fields?: string[]): string {
  if (!fields || fields.length === 0) return resource.defaultFields;
  return fields.join(" ");
}

export function buildSearchQuery(resource: ResourceDef, params: SearchParams): QueryResult {
  const fields = resolveFields(resource, params.fields);
  const operationName = `Search${resource.plural.charAt(0).toUpperCase()}${resource.plural.slice(1)}`;

  const queryArgs: string[] = [];
  const variables: Record<string, unknown> = {};

  const first = Math.min(params.first ?? 20, 100);
  queryArgs.push(`first: ${first}`);

  if (params.filter) {
    queryArgs.push("filter: $filter");
    variables.filter = params.filter;
  }
  if (params.orderBy) {
    queryArgs.push("orderBy: $orderBy");
    variables.orderBy = params.orderBy;
  }
  if (params.after) {
    queryArgs.push("after: $after");
    variables.after = params.after;
  }

  const varDefs: string[] = [];
  if (params.filter) varDefs.push("$filter: JSON");
  if (params.orderBy) varDefs.push("$orderBy: JSON");
  if (params.after) varDefs.push("$after: String");

  const varDefStr = varDefs.length > 0 ? `(${varDefs.join(", ")})` : "";
  const argsStr = queryArgs.length > 0 ? `(${queryArgs.join(", ")})` : "";

  const query = `query ${operationName}${varDefStr} {
  ${resource.queryPlural}${argsStr} {
    totalCount
    edges {
      node { ${fields} }
      cursor
    }
    pageInfo { endCursor hasNextPage }
  }
}`;

  return { query, variables, operationName, resultKey: resource.queryPlural };
}

export function buildGetQuery(resource: ResourceDef, id: string, fields?: string[]): QueryResult {
  const resolvedFields = resolveFields(resource, fields);
  const operationName = `Get${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)}`;

  const query = `query ${operationName}($filter: JSON) {
  ${resource.querySingular}(filter: $filter) {
    ${resolvedFields}
  }
}`;

  return {
    query,
    variables: { filter: { id: { eq: id } } },
    operationName,
    resultKey: resource.querySingular,
  };
}

export function buildCreateMutation(resource: ResourceDef, data: Record<string, unknown>, fields?: string[]): QueryResult {
  const resolvedFields = resolveFields(resource, fields);
  const operationName = `Create${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)}`;

  const query = `mutation ${operationName}($data: JSON!) {
  ${resource.createMutation}(data: $data) {
    ${resolvedFields}
  }
}`;

  return {
    query,
    variables: { data },
    operationName,
    resultKey: resource.createMutation,
  };
}

export function buildUpdateMutation(resource: ResourceDef, id: string, data: Record<string, unknown>, fields?: string[]): QueryResult {
  const resolvedFields = resolveFields(resource, fields);
  const operationName = `Update${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)}`;

  const query = `mutation ${operationName}($id: ID!, $data: JSON!) {
  ${resource.updateMutation}(id: $id, data: $data) {
    ${resolvedFields}
  }
}`;

  return {
    query,
    variables: { id, data },
    operationName,
    resultKey: resource.updateMutation,
  };
}

export function buildDeleteMutation(resource: ResourceDef, id: string): QueryResult {
  const operationName = `Delete${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)}`;

  const query = `mutation ${operationName}($id: ID!) {
  ${resource.deleteMutation}(id: $id) {
    id deletedAt
  }
}`;

  return {
    query,
    variables: { id },
    operationName,
    resultKey: resource.deleteMutation,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/crm-twenty/mcp && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/crm-twenty/mcp/graphql/builder.ts
git commit -m "feat(crm-twenty): add dynamic GraphQL query/mutation builder"
```

---

### Task 5: MCP Server Entry Point (All 5 Tools)

**Files:**
- Create: `plugins/crm-twenty/mcp/index.ts`

- [ ] **Step 1: Create the MCP server with all 5 tools**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TwentyClient } from "./client.js";
import { getResource, RESOURCE_NAMES } from "./resources.js";
import {
  buildSearchQuery,
  buildGetQuery,
  buildCreateMutation,
  buildUpdateMutation,
  buildDeleteMutation,
} from "./graphql/builder.js";

const server = new McpServer({
  name: "crm-twenty",
  version: "1.0.0",
});

const client = new TwentyClient();

const resourceEnum = z.enum(RESOURCE_NAMES as [string, ...string[]]);

// --- crm_twenty_search ---
server.registerTool(
  "crm_twenty_search",
  {
    description:
      "Search and list CRM records with filtering, ordering, and pagination. Supports: people, companies, opportunities, tasks, notes, attachments, favorites, timelineActivities, workspaceMembers.",
    inputSchema: {
      resource: resourceEnum.describe("The CRM resource type to search"),
      filter: z.record(z.unknown()).optional().describe("Filter criteria. Keys are field names, values are filter objects (e.g. {city: {eq: 'Berlin'}}). Supports and/or/not."),
      orderBy: z.record(z.string()).optional().describe("Sort order. Keys are field names, values are AscNullsFirst | AscNullsLast | DescNullsFirst | DescNullsLast"),
      fields: z.array(z.string()).optional().describe("Fields to return. Omit for defaults."),
      first: z.number().int().min(1).max(100).optional().describe("Number of records (default 20, max 100)"),
      after: z.string().optional().describe("Pagination cursor from previous response"),
    },
  },
  async (params) => {
    const resource = getResource(params.resource);
    const { query, variables, operationName, resultKey } = buildSearchQuery(resource, params);
    const data = await client.query<Record<string, unknown>>(operationName, query, variables);
    return { content: [{ type: "text", text: JSON.stringify(data[resultKey], null, 2) }] };
  },
);

// --- crm_twenty_get ---
server.registerTool(
  "crm_twenty_get",
  {
    description: "Get a single CRM record by ID",
    inputSchema: {
      resource: resourceEnum.describe("The CRM resource type"),
      id: z.string().describe("The record UUID"),
      fields: z.array(z.string()).optional().describe("Fields to return. Omit for defaults."),
    },
  },
  async (params) => {
    const resource = getResource(params.resource);
    const { query, variables, operationName, resultKey } = buildGetQuery(resource, params.id, params.fields);
    const data = await client.query<Record<string, unknown>>(operationName, query, variables);
    return { content: [{ type: "text", text: JSON.stringify(data[resultKey], null, 2) }] };
  },
);

// --- crm_twenty_create ---
server.registerTool(
  "crm_twenty_create",
  {
    description: "Create a new CRM record. See skill guide for field names per resource.",
    inputSchema: {
      resource: resourceEnum.describe("The CRM resource type to create"),
      data: z.record(z.unknown()).describe("Record data. Fields depend on resource type."),
    },
  },
  async (params) => {
    const resource = getResource(params.resource);
    const { query, variables, operationName, resultKey } = buildCreateMutation(resource, params.data);
    const result = await client.query<Record<string, unknown>>(operationName, query, variables);
    return { content: [{ type: "text", text: JSON.stringify(result[resultKey], null, 2) }] };
  },
);

// --- crm_twenty_update ---
server.registerTool(
  "crm_twenty_update",
  {
    description: "Update an existing CRM record. Only include fields you want to change.",
    inputSchema: {
      resource: resourceEnum.describe("The CRM resource type to update"),
      id: z.string().describe("The record UUID to update"),
      data: z.record(z.unknown()).describe("Fields to update."),
    },
  },
  async (params) => {
    const resource = getResource(params.resource);
    const { query, variables, operationName, resultKey } = buildUpdateMutation(resource, params.id, params.data);
    const result = await client.query<Record<string, unknown>>(operationName, query, variables);
    return { content: [{ type: "text", text: JSON.stringify(result[resultKey], null, 2) }] };
  },
);

// --- crm_twenty_delete ---
server.registerTool(
  "crm_twenty_delete",
  {
    description: "Soft-delete a CRM record (can be restored).",
    inputSchema: {
      resource: resourceEnum.describe("The CRM resource type to delete"),
      id: z.string().describe("The record UUID to delete"),
    },
  },
  async (params) => {
    const resource = getResource(params.resource);
    const { query, variables, operationName, resultKey } = buildDeleteMutation(resource, params.id);
    const result = await client.query<Record<string, unknown>>(operationName, query, variables);
    return { content: [{ type: "text", text: JSON.stringify(result[resultKey], null, 2) }] };
  },
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Twenty CRM MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/crm-twenty/mcp && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/crm-twenty/mcp/index.ts
git commit -m "feat(crm-twenty): add MCP server with 5 CRUD tools"
```

---

### Task 6: SKILL.md (Agent Routing Layer)

**Files:**
- Create: `plugins/crm-twenty/skills/crm-twenty/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: crm-twenty
description: Use when the user wants to interact with CRM data - looking up contacts, companies, deals, tasks, or notes in Twenty CRM. Also use when creating, updating, or managing sales pipeline records.
---

# Twenty CRM

You have access to Twenty CRM via 5 tools. All tools use a `resource` parameter to specify which entity type to operate on.

## Tools

| Tool | When to use |
|------|-------------|
| `crm_twenty_search` | List or filter records (e.g., "find all companies in Berlin") |
| `crm_twenty_get` | Get a single record by ID |
| `crm_twenty_create` | Create a new record |
| `crm_twenty_update` | Update fields on an existing record |
| `crm_twenty_delete` | Soft-delete a record |

## Resources

### people (contacts)
Key fields for create/update:
- `name: { firstName, lastName }` (required for create)
- `emails: { primaryEmail }`
- `phones: { primaryPhoneNumber }`
- `jobTitle`, `city`, `companyId`

Filter examples: `{name: {firstName: {like: "%John%"}}}`, `{city: {eq: "Berlin"}}`, `{companyId: {eq: "uuid"}}`

### companies
Key fields for create/update:
- `name` (required for create)
- `domainName: { primaryLinkUrl }`
- `address: { addressCity, addressCountry, addressStreet1 }`
- `employees`, `linkedinLink: { primaryLinkUrl }`
- `annualRecurringRevenue: { amountMicros, currencyCode }`
- `idealCustomerProfile` (boolean), `accountOwnerId`

Filter examples: `{name: {like: "%Acme%"}}`, `{idealCustomerProfile: {eq: true}}`

### opportunities (deals)
Key fields for create/update:
- `name`, `stage` (enum: INCOMING, QUALIFIED, MEETING, PROPOSAL, WON, LOST)
- `amount: { amountMicros, currencyCode }` (e.g., 50000 USD = `{amountMicros: 50000000000, currencyCode: "USD"}`)
- `closeDate` (ISO datetime), `companyId`, `pointOfContactId`, `ownerId`

Filter examples: `{stage: {eq: "QUALIFIED"}}`, `{ownerId: {eq: "uuid"}}`

### tasks
Key fields for create/update:
- `title` (required for create)
- `status` (enum: TODO, IN_PROGRESS, DONE)
- `dueAt` (ISO datetime), `assigneeId`

Filter examples: `{status: {eq: "TODO"}}`, `{assigneeId: {eq: "uuid"}}`, `{dueAt: {lte: "2026-04-30T00:00:00Z"}}`

### notes
Key fields for create/update:
- `title`, `bodyV2` (rich text as JSON)

To link a note to a person/company, create a `noteTarget` (not covered by this MCP yet — use Twenty's UI or a direct API call).

### attachments
Key fields for create:
- `name`, `fullPath`, `fileCategory` (enum: ARCHIVE, AUDIO, IMAGE, PRESENTATION, SPREADSHEET, TEXT_DOCUMENT, VIDEO, OTHER)
- Link to a record: `targetPersonId`, `targetCompanyId`, `targetOpportunityId`, `targetTaskId`, `targetNoteId`

### favorites
Key fields for create:
- One of: `companyId`, `personId`, `opportunityId`, `taskId`, `noteId`
- `position` (float, for ordering)

### timelineActivities (read-mostly)
Usually auto-generated by the system. Useful for reading activity history.
Filter by target: `{targetPersonId: {eq: "uuid"}}` or `{targetCompanyId: {eq: "uuid"}}`

### workspaceMembers (read-mostly)
Useful for looking up team members to assign tasks or opportunities.
Filter: `{name: {firstName: {like: "%Jane%"}}}`

## Filter Syntax

Filters use the Twenty GraphQL filter format:
- String: `{eq, neq, like, ilike, startsWith, endsWith, in, is}`
- Number: `{eq, neq, gt, gte, lt, lte, in, is}`
- Boolean: `{eq, is}`
- UUID: `{eq, neq, in, is}`
- DateTime: `{eq, neq, gt, gte, lt, lte, is}`
- Logical: `{and: [...], or: [...], not: {...}}`

## Pagination

`crm_twenty_search` returns up to 20 records by default. Use `first` (max 100) and `after` (cursor) for pagination. The response includes `pageInfo.endCursor` and `pageInfo.hasNextPage`.

## Common Workflows

**Find a contact and their company:**
1. `crm_twenty_search` with resource `people` and name filter
2. `crm_twenty_get` with resource `companies` and the `companyId` from step 1

**Create a deal:**
1. `crm_twenty_search` resource `companies` to find the company
2. `crm_twenty_search` resource `people` to find the point of contact
3. `crm_twenty_create` resource `opportunities` with `companyId`, `pointOfContactId`, `name`, `stage`, `amount`

**Assign a task:**
1. `crm_twenty_search` resource `workspaceMembers` to find the assignee
2. `crm_twenty_create` resource `tasks` with `title`, `assigneeId`, `dueAt`, `status: "TODO"`
```

- [ ] **Step 2: Commit**

```bash
git add plugins/crm-twenty/skills/crm-twenty/SKILL.md
git commit -m "feat(crm-twenty): add SKILL.md resource guide for agent routing"
```

---

### Task 7: REST Fallback Documentation

**Files:**
- Create: `plugins/crm-twenty/docs/rest-fallback.md`

- [ ] **Step 1: Create the fallback doc**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add plugins/crm-twenty/docs/rest-fallback.md
git commit -m "docs(crm-twenty): add REST fallback strategy"
```

---

### Task 8: Smoke Test Against Live API

- [ ] **Step 1: Run the MCP server and test manually**

Set environment variables and run:

```bash
export TWENTY_CRM_URL="https://your-twenty-instance.com"
export TWENTY_CRM_API_KEY="your-key-here"
cd plugins/crm-twenty/mcp && npx tsx index.ts
```

The server should start and print `Twenty CRM MCP server running on stdio` to stderr. Since it uses stdio transport, it will wait for JSON-RPC messages on stdin.

- [ ] **Step 2: Test with a simple JSON-RPC call**

In a separate terminal, or by piping input:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | TWENTY_CRM_URL="https://your-twenty-instance.com" TWENTY_CRM_API_KEY="your-key" npx tsx plugins/crm-twenty/mcp/index.ts
```

Expected: JSON response listing all 5 tools with their schemas.

- [ ] **Step 3: Test a search call**

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"crm_twenty_search","arguments":{"resource":"people","first":3}}}' | TWENTY_CRM_URL="https://your-twenty-instance.com" TWENTY_CRM_API_KEY="your-key" npx tsx plugins/crm-twenty/mcp/index.ts
```

Expected: JSON response with up to 3 people records from the CRM.

- [ ] **Step 4: Fix any issues found during testing**

If the GraphQL variable types are wrong (e.g., Twenty expects typed filter inputs instead of `JSON`), update `builder.ts` to match. The schema analysis showed filter types like `PersonFilterInput` — we may need to use those instead of generic `JSON`.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u plugins/crm-twenty/
git commit -m "fix(crm-twenty): fixes from live API testing"
```

---

### Task 9: Final Commit

- [ ] **Step 1: Verify the full plugin structure**

Run: `find plugins/crm-twenty -type f | grep -v node_modules | grep -v external | sort`

Expected output:
```
plugins/crm-twenty/.claude-plugin/plugin.json
plugins/crm-twenty/.mcp.json
plugins/crm-twenty/docs/rest-fallback.md
plugins/crm-twenty/mcp/client.ts
plugins/crm-twenty/mcp/graphql/builder.ts
plugins/crm-twenty/mcp/index.ts
plugins/crm-twenty/mcp/package-lock.json
plugins/crm-twenty/mcp/package.json
plugins/crm-twenty/mcp/resources.ts
plugins/crm-twenty/mcp/tsconfig.json
plugins/crm-twenty/skills/crm-twenty/SKILL.md
```

- [ ] **Step 2: Final commit if any cleanup was needed**

```bash
git add plugins/crm-twenty/
git commit -m "feat(crm-twenty): complete Twenty CRM MCP plugin"
```
