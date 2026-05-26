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
  buildRestoreMutation,
  buildBulkCreateMutation,
  buildBulkUpdateMutation,
  buildBulkDeleteMutation,
  buildFullTextSearchQuery,
  buildDuplicatesQuery,
  buildGroupByQuery,
} from "./graphql/builder.js";

export function createMcpServer(client: TwentyClient): McpServer {
  const server = new McpServer({
    name: "crm-twenty",
    version: "1.2.1",
  });

  const resourceEnum = z.enum(RESOURCE_NAMES as [string, ...string[]]);

  /** Inject web UI URLs into response records. */
  function injectUrls(data: unknown, resourceSingular: string): unknown {
    if (Array.isArray(data)) {
      return data.map((item) => injectUrls(item, resourceSingular));
    }
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if ("edges" in obj && Array.isArray(obj.edges)) {
        return {
          ...obj,
          edges: (obj.edges as Array<{ node: unknown; cursor?: string }>).map((edge) => ({
            ...edge,
            node: injectUrls(edge.node, resourceSingular),
          })),
        };
      }
      if ("id" in obj && typeof obj.id === "string") {
        return { ...obj, url: client.recordUrl(resourceSingular, obj.id) };
      }
    }
    return data;
  }

  function formatResult(data: unknown, resourceSingular: string) {
    return { content: [{ type: "text" as const, text: JSON.stringify(injectUrls(data, resourceSingular), null, 2) }] };
  }

  function formatRaw(data: unknown) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }

  async function getSchemaText(resourceName: string, variant: "create" | "update" | "filter" = "create"): Promise<string> {
    const resource = getResource(resourceName);
    const suffixes = { create: "CreateInput", update: "UpdateInput", filter: "FilterInput" };
    const typeName = `${resource.typeName}${suffixes[variant]}`;
    const fields = await client.introspectInputType(typeName);
    return TwentyClient.formatSchema(typeName, fields);
  }

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
        "Get the field schema for a CRM resource type. Returns the exact input fields from Twenty CRM's GraphQL schema. Supports create, update, and filter schemas.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type"),
        variant: z.enum(["create", "update", "filter"]).optional().describe("Which schema to return: create (default), update, or filter"),
      },
    },
    async (params) => {
      const schema = await getSchemaText(params.resource, params.variant ?? "create");
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
        resource: resourceEnum.describe("The CRM resource type to search"),
        filter: z.record(z.unknown()).optional().describe("Filter criteria. Operators: {eq, neq, like, ilike, gt, gte, lt, lte, in, is}. Logical: {and: [...], or: [...], not: {...}}"),
        orderBy: z.record(z.string()).optional().describe("Sort order. Keys are field names, values are AscNullsFirst | AscNullsLast | DescNullsFirst | DescNullsLast"),
        fields: z.array(z.string()).optional().describe("Fields to return (GraphQL selection). Supports nested relations."),
        first: z.number().int().min(1).max(100).optional().describe("Forward pagination: number of records (default 20, max 100)"),
        after: z.string().optional().describe("Forward pagination cursor (from pageInfo.endCursor)"),
        last: z.number().int().min(1).max(100).optional().describe("Backward pagination: number of records from the end"),
        before: z.string().optional().describe("Backward pagination cursor"),
        offset: z.number().int().min(0).optional().describe("Skip this many records (offset-based pagination)"),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildSearchQuery(resource, params);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(data[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_get ---
  server.registerTool(
    "crm_twenty_get",
    {
      description: "Get a single CRM record by ID.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type"),
        id: z.string().describe("The record UUID"),
        fields: z.array(z.string()).optional().describe("Fields to return (GraphQL selection). Omit to use defaults."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildGetQuery(resource, params.id, params.fields);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(data[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_create ---
  server.registerTool(
    "crm_twenty_create",
    {
      description:
        "Create a new CRM record. IMPORTANT: Call crm_twenty_schema first to get the exact field names and types — many fields require nested objects (e.g. name: {firstName, lastName}, emails: {primaryEmail}).",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to create"),
        data: z.record(z.unknown()).describe("Record data. MUST match the schema from crm_twenty_schema — use nested objects where required."),
        upsert: z.boolean().optional().describe("If true, update existing record instead of failing on conflict."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildCreateMutation(resource, params.data, params.upsert);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_bulk_create ---
  server.registerTool(
    "crm_twenty_bulk_create",
    {
      description:
        "Create multiple CRM records in one call. Pass an array of record objects. Call crm_twenty_schema first for field names.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to create"),
        data: z.array(z.record(z.unknown())).min(1).max(100).describe("Array of record objects to create (max 100)."),
        upsert: z.boolean().optional().describe("If true, update existing records instead of failing on conflict."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildBulkCreateMutation(resource, params.data, params.upsert);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_update ---
  server.registerTool(
    "crm_twenty_update",
    {
      description:
        "Update an existing CRM record. Only include fields you want to change. Call crm_twenty_schema first to get the exact field names and types.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to update"),
        id: z.string().describe("The record UUID to update"),
        data: z.record(z.unknown()).describe("Fields to update. MUST match the schema from crm_twenty_schema — use nested objects where required."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildUpdateMutation(resource, params.id, params.data);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_bulk_update ---
  server.registerTool(
    "crm_twenty_bulk_update",
    {
      description:
        "Update multiple CRM records matching a filter. All matching records get the same field changes.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to update"),
        filter: z.record(z.unknown()).describe("Filter to select records to update. Use crm_twenty_search first to verify which records match."),
        data: z.record(z.unknown()).describe("Fields to update on all matching records."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildBulkUpdateMutation(resource, params.filter, params.data);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_delete ---
  server.registerTool(
    "crm_twenty_delete",
    {
      description: "Soft-delete a CRM record (can be restored with crm_twenty_restore).",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to delete"),
        id: z.string().describe("The record UUID to delete"),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildDeleteMutation(resource, params.id);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_bulk_delete ---
  server.registerTool(
    "crm_twenty_bulk_delete",
    {
      description:
        "Soft-delete multiple CRM records matching a filter. Use crm_twenty_search first to verify which records match.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to delete"),
        filter: z.record(z.unknown()).describe("Filter to select records to soft-delete."),
      },
    },
    withSchemaOnError(async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildBulkDeleteMutation(resource, params.filter);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.singular);
    }),
  );

  // --- crm_twenty_restore ---
  server.registerTool(
    "crm_twenty_restore",
    {
      description: "Restore a soft-deleted CRM record.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to restore"),
        id: z.string().describe("The record UUID to restore"),
      },
    },
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildRestoreMutation(resource, params.id);
      const result = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(result[resultKey], resource.singular);
    },
  );

  // --- crm_twenty_fulltext_search ---
  server.registerTool(
    "crm_twenty_fulltext_search",
    {
      description: "Search across all CRM record types (companies, people, opportunities, etc.) using full-text search. Returns matching records ranked by relevance.",
      inputSchema: {
        searchInput: z.string().describe("The search text"),
        limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
        after: z.string().optional().describe("Pagination cursor"),
        includedObjectNameSingulars: z.array(z.string()).optional().describe("Only search these types, e.g. [\"company\", \"person\"]"),
        excludedObjectNameSingulars: z.array(z.string()).optional().describe("Exclude these types from results"),
      },
    },
    async (params) => {
      const { query, variables, operationName, resultKey } = buildFullTextSearchQuery(params);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatRaw(data[resultKey]);
    },
  );

  // --- crm_twenty_duplicates ---
  server.registerTool(
    "crm_twenty_duplicates",
    {
      description: "Check for duplicate records before creating. Only supports people and companies. Pass candidate record data to find potential matches.",
      inputSchema: {
        resource: z.enum(["people", "companies"]).describe("Resource type to check (people or companies)"),
        data: z.array(z.record(z.unknown())).min(1).max(10).describe("Candidate records to check for duplicates"),
      },
    },
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildDuplicatesQuery(resource, params.data);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(data[resultKey], resource.singular);
    },
  );

  // --- crm_twenty_group_by ---
  server.registerTool(
    "crm_twenty_group_by",
    {
      description:
        "Aggregate CRM records with groupBy. Returns counts, percentages, min/max for grouped fields. Useful for analytics like 'how many deals per stage' or 'companies by country'.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to aggregate"),
        groupBy: z.array(z.record(z.unknown())).min(1).describe("Fields to group by. Each entry is {fieldName: true} for simple grouping or {fieldName: granularity} for dates."),
        filter: z.record(z.unknown()).optional().describe("Optional filter to narrow records before grouping"),
        limit: z.number().int().min(1).optional().describe("Max number of groups to return"),
        fields: z.array(z.string()).optional().describe("GroupBy result fields to return (default: totalCount). Available fields include totalCount, countUniqueValues*, countEmpty*, percentageEmpty*, min*, max* per grouped field."),
      },
    },
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildGroupByQuery(resource, params);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatRaw(data[resultKey]);
    },
  );

  return server;
}
