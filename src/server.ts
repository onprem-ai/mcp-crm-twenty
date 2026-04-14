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
      return { content: [{ type: "text" as const, text: JSON.stringify(data[resultKey], null, 2) }] };
    },
  );

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
      return { content: [{ type: "text" as const, text: JSON.stringify(data[resultKey], null, 2) }] };
    },
  );

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
      return { content: [{ type: "text" as const, text: JSON.stringify(result[resultKey], null, 2) }] };
    },
  );

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
      return { content: [{ type: "text" as const, text: JSON.stringify(result[resultKey], null, 2) }] };
    },
  );

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
      return { content: [{ type: "text" as const, text: JSON.stringify(result[resultKey], null, 2) }] };
    },
  );

  return server;
}
