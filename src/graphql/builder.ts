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
  if (params.filter) varDefs.push(`$filter: ${resource.typeName}FilterInput`);
  if (params.orderBy) varDefs.push(`$orderBy: [${resource.typeName}OrderByInput]`);
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

export function buildCreateMutation(resource: ResourceDef, data: Record<string, unknown>, fields?: string[]): QueryResult {
  const resolvedFields = resolveFields(resource, fields);
  const operationName = `Create${resource.singular.charAt(0).toUpperCase()}${resource.singular.slice(1)}`;

  const query = `mutation ${operationName}($data: ${resource.typeName}CreateInput!) {
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
