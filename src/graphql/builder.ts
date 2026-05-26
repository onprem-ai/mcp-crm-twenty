import { type ResourceDef } from "../resources.js";

export interface SearchParams {
  filter?: Record<string, unknown>;
  orderBy?: Record<string, string>;
  fields?: string[];
  first?: number;
  last?: number;
  after?: string;
  before?: string;
  offset?: number;
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
  const varDefs: string[] = [];

  if (params.last != null) {
    const last = Math.min(params.last, 100);
    queryArgs.push(`last: ${last}`);
  } else {
    const first = Math.min(params.first ?? 20, 100);
    queryArgs.push(`first: ${first}`);
  }

  if (params.offset != null) {
    queryArgs.push(`offset: ${params.offset}`);
  }
  if (params.filter) {
    queryArgs.push("filter: $filter");
    variables.filter = params.filter;
    varDefs.push(`$filter: ${resource.typeName}FilterInput`);
  }
  if (params.orderBy) {
    queryArgs.push("orderBy: $orderBy");
    variables.orderBy = params.orderBy;
    varDefs.push(`$orderBy: [${resource.typeName}OrderByInput]`);
  }
  if (params.after) {
    queryArgs.push("after: $after");
    variables.after = params.after;
    varDefs.push("$after: String");
  }
  if (params.before) {
    queryArgs.push("before: $before");
    variables.before = params.before;
    varDefs.push("$before: String");
  }

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

  const query = `query ${operationName}($filter: ${resource.typeName}FilterInput!) {
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

export function buildCreateMutation(resource: ResourceDef, data: Record<string, unknown>, upsert?: boolean, fields?: string[]): QueryResult {
  const resolvedFields = resolveFields(resource, fields);
  const operationName = `Create${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)}`;

  const upsertArg = upsert ? ", upsert: true" : "";
  const query = `mutation ${operationName}($data: ${resource.typeName}CreateInput!) {
  ${resource.createMutation}(data: $data${upsertArg}) {
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

  const query = `mutation ${operationName}($id: UUID!, $data: ${resource.typeName}UpdateInput!) {
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

  const query = `mutation ${operationName}($id: UUID!) {
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

export function buildRestoreMutation(resource: ResourceDef, id: string): QueryResult {
  const operationName = `Restore${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)}`;

  const query = `mutation ${operationName}($id: UUID!) {
  ${resource.restoreMutation}(id: $id) {
    id
  }
}`;

  return {
    query,
    variables: { id },
    operationName,
    resultKey: resource.restoreMutation,
  };
}

export function buildBulkCreateMutation(resource: ResourceDef, data: Record<string, unknown>[], upsert?: boolean, fields?: string[]): QueryResult {
  const resolvedFields = resolveFields(resource, fields);
  const cap = resource.plural.charAt(0).toUpperCase() + resource.plural.slice(1);
  const operationName = `Create${cap}`;
  const mutationName = `create${cap}`;

  const upsertArg = upsert ? ", upsert: true" : "";
  const query = `mutation ${operationName}($data: [${resource.typeName}CreateInput!]!) {
  ${mutationName}(data: $data${upsertArg}) {
    ${resolvedFields}
  }
}`;

  return {
    query,
    variables: { data },
    operationName,
    resultKey: mutationName,
  };
}

export interface FullTextSearchParams {
  searchInput: string;
  limit?: number;
  after?: string;
  includedObjectNameSingulars?: string[];
  excludedObjectNameSingulars?: string[];
}

export function buildFullTextSearchQuery(params: FullTextSearchParams): QueryResult {
  const operationName = "FullTextSearch";
  const limit = Math.min(params.limit ?? 20, 100);

  const varDefs = ["$searchInput: String!", "$limit: Int!"];
  const args = ["searchInput: $searchInput", "limit: $limit"];
  const variables: Record<string, unknown> = { searchInput: params.searchInput, limit };

  if (params.after) {
    varDefs.push("$after: String");
    args.push("after: $after");
    variables.after = params.after;
  }
  if (params.includedObjectNameSingulars) {
    varDefs.push("$includedObjectNameSingulars: [String!]");
    args.push("includedObjectNameSingulars: $includedObjectNameSingulars");
    variables.includedObjectNameSingulars = params.includedObjectNameSingulars;
  }
  if (params.excludedObjectNameSingulars) {
    varDefs.push("$excludedObjectNameSingulars: [String!]");
    args.push("excludedObjectNameSingulars: $excludedObjectNameSingulars");
    variables.excludedObjectNameSingulars = params.excludedObjectNameSingulars;
  }

  const query = `query ${operationName}(${varDefs.join(", ")}) {
  search(${args.join(", ")}) {
    edges {
      node { recordId objectNameSingular label imageUrl tsRankCD tsRank }
      cursor
    }
    pageInfo { endCursor hasNextPage }
  }
}`;

  return { query, variables, operationName, resultKey: "search" };
}

export function buildBulkUpdateMutation(resource: ResourceDef, filter: Record<string, unknown>, data: Record<string, unknown>, fields?: string[]): QueryResult {
  const resolvedFields = resolveFields(resource, fields);
  const cap = resource.plural.charAt(0).toUpperCase() + resource.plural.slice(1);
  const operationName = `Update${cap}`;
  const mutationName = `update${cap}`;

  const query = `mutation ${operationName}($data: ${resource.typeName}UpdateInput!, $filter: ${resource.typeName}FilterInput!) {
  ${mutationName}(data: $data, filter: $filter) {
    ${resolvedFields}
  }
}`;

  return {
    query,
    variables: { data, filter },
    operationName,
    resultKey: mutationName,
  };
}

export function buildBulkDeleteMutation(resource: ResourceDef, filter: Record<string, unknown>): QueryResult {
  const cap = resource.plural.charAt(0).toUpperCase() + resource.plural.slice(1);
  const operationName = `Delete${cap}`;
  const mutationName = `delete${cap}`;

  const query = `mutation ${operationName}($filter: ${resource.typeName}FilterInput!) {
  ${mutationName}(filter: $filter) {
    id deletedAt
  }
}`;

  return {
    query,
    variables: { filter },
    operationName,
    resultKey: mutationName,
  };
}

export interface GroupByParams {
  groupBy: Record<string, unknown>[];
  filter?: Record<string, unknown>;
  limit?: number;
  fields?: string[];
}

export function buildGroupByQuery(resource: ResourceDef, params: GroupByParams): QueryResult {
  const cap = resource.plural.charAt(0).toUpperCase() + resource.plural.slice(1);
  const operationName = `${cap}GroupBy`;
  const queryName = `${resource.queryPlural}GroupBy`;

  const varDefs = [`$groupBy: [${resource.typeName}GroupByInput!]!`];
  const args = ["groupBy: $groupBy"];
  const variables: Record<string, unknown> = { groupBy: params.groupBy };

  if (params.filter) {
    varDefs.push(`$filter: ${resource.typeName}FilterInput`);
    args.push("filter: $filter");
    variables.filter = params.filter;
  }
  if (params.limit != null) {
    args.push(`limit: ${params.limit}`);
  }

  const fields = params.fields?.join(" ") ?? "totalCount";

  const query = `query ${operationName}(${varDefs.join(", ")}) {
  ${queryName}(${args.join(", ")}) {
    ${fields}
  }
}`;

  return { query, variables, operationName, resultKey: queryName };
}

export function buildDuplicatesQuery(resource: ResourceDef, data: Record<string, unknown>[]): QueryResult {
  const cap = resource.singular.charAt(0).toUpperCase() + resource.singular.slice(1);
  const operationName = `${cap}Duplicates`;
  const queryName = `${resource.singular}Duplicates`;

  const query = `query ${operationName}($data: [${resource.typeName}CreateInput!]) {
  ${queryName}(data: $data) {
    edges {
      node { ${resource.defaultFields} }
      cursor
    }
    totalCount
  }
}`;

  return {
    query,
    variables: { data },
    operationName,
    resultKey: queryName,
  };
}
