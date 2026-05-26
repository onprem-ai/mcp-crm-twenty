import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TwentyClient } from "./client.js";
import { getResource, RESOURCE_NAMES } from "./resources.js";
import {
  buildSearchQuery,
  buildGetQuery,
  buildRestoreMutation,
  buildFullTextSearchQuery,
  buildDuplicatesQuery,
  buildGroupByQuery,
} from "./graphql/builder.js";

export function createMcpServer(client: TwentyClient): McpServer {
  const server = new McpServer({
    name: "crm-twenty",
    version: "1.3.0",
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

  function formatError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
  }

  // --- crm_twenty_schema ---
  server.registerTool(
    "crm_twenty_schema",
    {
      description:
        "Get the field schema for a CRM resource type. Returns ALL fields including custom fields from Twenty's metadata API. Shows field names, types, and whether they are custom.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type"),
      },
    },
    async (params) => {
      const resource = getResource(params.resource);
      try {
        const fields = await client.getCompleteSchema(resource.singular);
        const schema = TwentyClient.formatMetadataSchema(resource.singular, fields);
        return { content: [{ type: "text" as const, text: schema }] };
      } catch {
        const fields = await client.introspectInputType(`${resource.typeName}CreateInput`);
        return { content: [{ type: "text" as const, text: TwentyClient.formatSchema(`${resource.typeName}CreateInput`, fields) + "\n\n(Note: custom fields not shown - metadata API unavailable)" }] };
      }
    },
  );

  // --- crm_twenty_search (GraphQL) ---
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
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildSearchQuery(resource, params);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(data[resultKey], resource.singular);
    },
  );

  // --- crm_twenty_get (GraphQL) ---
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
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildGetQuery(resource, params.id, params.fields);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatResult(data[resultKey], resource.singular);
    },
  );

  // --- crm_twenty_create (REST) ---
  server.registerTool(
    "crm_twenty_create",
    {
      description:
        "Create a new CRM record via REST API. Supports all fields including custom fields. Call crm_twenty_schema first to get field names and types.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to create"),
        data: z.record(z.unknown()).describe("Record data. Field names must match the schema from crm_twenty_schema."),
      },
    },
    async (params) => {
      try {
        const resource = getResource(params.resource);
        const result = await client.restCreate(resource.plural, params.data);
        return formatResult(result, resource.singular);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_bulk_create (REST) ---
  server.registerTool(
    "crm_twenty_bulk_create",
    {
      description:
        "Create multiple CRM records in one call via REST API. Supports all fields including custom fields.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to create"),
        data: z.array(z.record(z.unknown())).min(1).max(60).describe("Array of record objects to create (max 60)."),
      },
    },
    async (params) => {
      try {
        const resource = getResource(params.resource);
        const result = await client.restBulkCreate(resource.plural, params.data);
        return formatResult(result, resource.singular);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_update (REST) ---
  server.registerTool(
    "crm_twenty_update",
    {
      description:
        "Update an existing CRM record via REST API. Supports all fields including custom fields. Only include fields you want to change.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to update"),
        id: z.string().describe("The record UUID to update"),
        data: z.record(z.unknown()).describe("Fields to update. Field names must match the schema from crm_twenty_schema."),
      },
    },
    async (params) => {
      try {
        const resource = getResource(params.resource);
        const result = await client.restUpdate(resource.plural, params.id, params.data);
        return formatResult(result, resource.singular);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_bulk_update (REST) ---
  server.registerTool(
    "crm_twenty_bulk_update",
    {
      description:
        "Update multiple CRM records in one call via REST API. Each record in the array must include its id plus the fields to update.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to update"),
        data: z.array(z.record(z.unknown())).min(1).max(60).describe("Array of objects, each with 'id' and fields to update."),
      },
    },
    async (params) => {
      try {
        const resource = getResource(params.resource);
        const result = await client.restBulkUpdate(resource.plural, params.data as Array<{ id: string } & Record<string, unknown>>);
        return formatResult(result, resource.singular);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_delete (REST) ---
  server.registerTool(
    "crm_twenty_delete",
    {
      description: "Soft-delete a CRM record via REST API (can be restored with crm_twenty_restore).",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to delete"),
        id: z.string().describe("The record UUID to delete"),
      },
    },
    async (params) => {
      try {
        const resource = getResource(params.resource);
        const result = await client.restDelete(resource.plural, params.id);
        return formatResult(result, resource.singular);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_bulk_delete (REST) ---
  server.registerTool(
    "crm_twenty_bulk_delete",
    {
      description:
        "Soft-delete multiple CRM records by IDs via REST API.",
      inputSchema: {
        resource: resourceEnum.describe("The CRM resource type to delete"),
        ids: z.array(z.string()).min(1).max(60).describe("Array of record UUIDs to soft-delete."),
      },
    },
    async (params) => {
      try {
        const resource = getResource(params.resource);
        const result = await client.restBulkDelete(resource.plural, params.ids);
        return formatResult(result, resource.singular);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_restore (GraphQL - no REST equivalent) ---
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

  // --- crm_twenty_fulltext_search (GraphQL) ---
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

  // --- crm_twenty_duplicates (GraphQL) ---
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

  // --- crm_twenty_group_by (GraphQL) ---
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
        fields: z.array(z.string()).optional().describe("GroupBy result fields to return (default: totalCount)."),
      },
    },
    async (params) => {
      const resource = getResource(params.resource);
      const { query, variables, operationName, resultKey } = buildGroupByQuery(resource, params);
      const data = await client.query<Record<string, unknown>>(operationName, query, variables);
      return formatRaw(data[resultKey]);
    },
  );

  // --- Model Tools (Metadata API) ---

  // --- crm_twenty_list_objects ---
  server.registerTool(
    "crm_twenty_list_objects",
    {
      description: "List all objects in the workspace (standard and custom), including their metadata IDs, names, and whether they are custom.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.metadataListObjects();
        return formatRaw(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_create_object ---
  server.registerTool(
    "crm_twenty_create_object",
    {
      description: "Create a new custom object in the workspace data model. After creation, it gets REST and GraphQL endpoints automatically.",
      inputSchema: {
        nameSingular: z.string().describe("Singular name for the object (e.g. 'invoice')"),
        namePlural: z.string().describe("Plural name for the object (e.g. 'invoices')"),
        labelSingular: z.string().describe("Singular display label (e.g. 'Invoice')"),
        labelPlural: z.string().describe("Plural display label (e.g. 'Invoices')"),
        description: z.string().optional().describe("Description of the object"),
        icon: z.string().optional().describe("Icon name (e.g. 'IconFileInvoice')"),
      },
    },
    async (params) => {
      try {
        const result = await client.metadataCreateObject(params);
        return formatRaw(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // --- crm_twenty_create_field ---
  server.registerTool(
    "crm_twenty_create_field",
    {
      description: "Add a custom field to any object. Use crm_twenty_list_objects first to get the objectMetadataId. Supported types: TEXT, NUMBER, BOOLEAN, DATE_TIME, SELECT, MULTI_SELECT, CURRENCY, LINKS, EMAILS, PHONES, RELATION, RATING, ADDRESS, and more.",
      inputSchema: {
        objectMetadataId: z.string().describe("The UUID of the object to add the field to (from crm_twenty_list_objects)"),
        name: z.string().describe("Field name in camelCase (e.g. 'invoiceAmount')"),
        label: z.string().describe("Display label (e.g. 'Invoice Amount')"),
        type: z.string().describe("Field type: TEXT, NUMBER, BOOLEAN, DATE_TIME, SELECT, MULTI_SELECT, CURRENCY, LINKS, EMAILS, PHONES, RELATION, RATING, ADDRESS, RICH_TEXT"),
        description: z.string().optional().describe("Field description"),
        icon: z.string().optional().describe("Icon name"),
        options: z.array(z.record(z.unknown())).optional().describe("Options for SELECT/MULTI_SELECT fields: [{value, label, position, color}]"),
      },
    },
    async (params) => {
      try {
        const result = await client.metadataCreateField(params);
        return formatRaw(result);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  return server;
}
