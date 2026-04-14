import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export function createMcpServer(client: TwentyClient): McpServer {
  const server = new McpServer({
    name: "crm-twenty",
    version: "1.0.0",
  });

  const resourceEnum = z.enum(RESOURCE_NAMES as [string, ...string[]]);

  /** Inject web UI URLs into response records. */
  function injectUrls(data: unknown, resourcePlural: string): unknown {
    if (Array.isArray(data)) {
      return data.map((item) => injectUrls(item, resourcePlural));
    }
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      // Search results have edges[].node structure
      if ("edges" in obj && Array.isArray(obj.edges)) {
        return {
          ...obj,
          edges: (obj.edges as Array<{ node: unknown; cursor?: string }>).map((edge) => ({
            ...edge,
            node: injectUrls(edge.node, resourcePlural),
          })),
        };
      }
      // Single record with id
      if ("id" in obj && typeof obj.id === "string") {
        return { ...obj, url: client.recordUrl(resourcePlural, obj.id) };
      }
    }
    return data;
  }

  /** Format result with injected URLs. */
  function formatResult(data: unknown, resourcePlural: string) {
    return { content: [{ type: "text" as const, text: JSON.stringify(injectUrls(data, resourcePlural), null, 2) }] };
  }

  /** Fetch and format the schema for a resource's CreateInput type. */
  async function getSchemaText(resourceName: string): Promise<string> {
    const resource = getResource(resourceName);
    const typeName = `${resource.typeName}CreateInput`;
    const fields = await client.introspectInputType(typeName);
    return TwentyClient.formatSchema(typeName, fields);
  }

  /** Wrap a tool handler to append schema info on errors. */
  function withSchemaOnError<P extends { resource: string }>(
    handler: (params: P) => Promise<{ content: { type: "text"; text: string }[] }>,
  ) {
    return async (params: P) => {
      try {
        return await handler(params);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        let schemaHint = "";
        try {
          schemaHint = "\n\nExpected field schema (from GraphQL introspection):\n" + await getSchemaText(params.resource);
        } catch { /* ignore introspection errors */ }
        return { content: [{ type: "text" as const, text: `Error: ${msg}${schemaHint}` }] };
      }
    };
  }

  // --- crm_twenty_schema ---
  server.registerTool(
    "crm_twenty_schema",
    {
      description:
        "Get the field schema for a CRM resource type. ALWAYS call this before crm_twenty_create or crm_twenty_update to get the correct field names and types. Returns the exact input fields from Twenty CRM's GraphQL schema.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type: people, companies, opportunities, tasks, notes, attachments, favorites, timelineActivities, workspaceMembers"),
      },
    },
    async (params) => {
      const schema = await getSchemaText(params.resource);
      return { content: [{ type: "text" as const, text: schema }] };
    },
  );

  // --- crm_twenty_search ---
  server.registerTool(
    "crm_twenty_search",
    {
      description:
        "Search and list CRM records with filtering, ordering, and pagination. Call crm_twenty_schema first to see available fields for filtering.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to search: people, companies, opportunities, tasks, notes, attachments, favorites, timelineActivities, workspaceMembers"),
        filter: z.record(z.unknown()).optional().describe("Filter criteria using field names from crm_twenty_schema. Operators: {eq, neq, like, ilike, gt, gte, lt, lte, in, is}. Logical: {and: [...], or: [...], not: {...}}. Example: {name: {firstName: {like: \"%John%\"}}}"),
        orderBy: z.record(z.string()).optional().describe("Sort order. Keys are field names, values are AscNullsFirst | AscNullsLast | DescNullsFirst | DescNullsLast"),
        fields: z.array(z.string()).optional().describe("Fields to return (GraphQL selection). Omit to use defaults."),
        first: z.number().int().min(1).max(100).optional().describe("Number of records to return (default 20, max 100)"),
        after: z.string().optional().describe("Pagination cursor from previous response's pageInfo.endCursor"),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildSearchQuery(resource, params);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(data[resultKey], resource.plural);
    }),
  );

  // --- crm_twenty_get ---
  server.registerTool(
    "crm_twenty_get",
    {
      description: "Get a single CRM record by ID.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type: people, companies, opportunities, tasks, notes, attachments, favorites, timelineActivities, workspaceMembers"),
        id: z.string().describe("The record UUID"),
        fields: z.array(z.string()).optional().describe("Fields to return (GraphQL selection). Omit to use defaults."),
      },
    },
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildGetQuery(resource, params.id, params.fields);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(data[resultKey], resource.plural);
    },
  );

  // --- crm_twenty_create ---
  server.registerTool(
    "crm_twenty_create",
    {
      description:
        "Create a new CRM record. IMPORTANT: Call crm_twenty_schema first to get the exact field names and types — many fields require nested objects (e.g. name: {firstName, lastName}, emails: {primaryEmail}).",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to create: people, companies, opportunities, tasks, notes"),
        data: z.record(z.unknown()).describe("Record data. MUST match the schema from crm_twenty_schema — use nested objects where required."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildCreateMutation(resource, params.data);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.plural);
    }),
  );

  // --- crm_twenty_update ---
  server.registerTool(
    "crm_twenty_update",
    {
      description:
        "Update an existing CRM record. Only include fields you want to change. Call crm_twenty_schema first to get the exact field names and types.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to update: people, companies, opportunities, tasks, notes"),
        id: z.string().describe("The record UUID to update"),
        data: z.record(z.unknown()).describe("Fields to update. MUST match the schema from crm_twenty_schema — use nested objects where required."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildUpdateMutation(resource, params.id, params.data);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.plural);
    }),
  );

  // --- crm_twenty_delete ---
  server.registerTool(
    "crm_twenty_delete",
    {
      description: "Soft-delete a CRM record (can be restored from Twenty's UI).",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to delete: people, companies, opportunities, tasks, notes"),
        id: z.string().describe("The record UUID to delete"),
      },
    },
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildDeleteMutation(resource, params.id);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.plural);
    },
  );

  return server;
}
