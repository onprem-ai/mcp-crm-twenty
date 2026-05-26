export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

interface IntrospectionField {
  name: string;
  type: {
    name: string | null;
    kind: string;
    ofType: { name: string | null; kind: string; ofType: { name: string | null } | null } | null;
  };
}

interface IntrospectionType {
  name: string;
  inputFields: IntrospectionField[];
}

export interface FieldInfo {
  name: string;
  type: string;
  fields?: FieldInfo[];
}

export interface MetadataFieldInfo {
  name: string;
  label: string;
  type: string;
  isCustom: boolean;
  isNullable: boolean;
  isSystem: boolean;
  description?: string;
}

export class TwentyClient {
  private baseUrl: string;
  private apiKey: string;
  private schemaCache = new Map<string, FieldInfo[]>();
  private metadataCache = new Map<string, MetadataFieldInfo[]>();

  constructor(url: string, apiKey: string) {
    this.baseUrl = url.replace(/\/(rest|api|graphql)\/?$/, "");
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  // --- REST Data API ---

  async restCreate(resourcePlural: string, data: Record<string, unknown>): Promise<unknown> {
    return this.restRequest("POST", `/rest/${resourcePlural}`, data);
  }

  async restUpdate(resourcePlural: string, id: string, data: Record<string, unknown>): Promise<unknown> {
    return this.restRequest("PATCH", `/rest/${resourcePlural}/${id}`, data);
  }

  async restDelete(resourcePlural: string, id: string): Promise<unknown> {
    return this.restRequest("DELETE", `/rest/${resourcePlural}/${id}`);
  }

  async restBulkCreate(resourcePlural: string, data: Record<string, unknown>[]): Promise<unknown> {
    return this.restRequest("POST", `/rest/batch/${resourcePlural}`, data);
  }

  async restBulkUpdate(resourcePlural: string, data: Array<{ id: string } & Record<string, unknown>>): Promise<unknown> {
    return this.restRequest("PATCH", `/rest/batch/${resourcePlural}`, data);
  }

  async restBulkDelete(resourcePlural: string, ids: string[]): Promise<unknown> {
    return this.restRequest("DELETE", `/rest/batch/${resourcePlural}`, { ids });
  }

  private async restRequest(method: string, path: string, body?: unknown): Promise<unknown> {
    const options: RequestInit = { method, headers: this.headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = result?.error?.message ?? result?.message ?? JSON.stringify(result) ?? response.statusText;
      throw new Error(`Twenty REST error (${response.status}): ${detail}`);
    }

    return result?.data ?? result;
  }

  // --- Metadata API ---

  async metadataListObjects(): Promise<unknown> {
    return this.restRequest("GET", "/rest/metadata/objects");
  }

  async metadataGetObjectByName(objectNameSingular: string): Promise<Record<string, unknown> | null> {
    const result = await this.restRequest("GET", "/rest/metadata/objects") as any;
    const objects = result?.data?.objects ?? result?.objects ?? (Array.isArray(result) ? result : []);
    for (const obj of objects) {
      if ((obj as any)?.nameSingular === objectNameSingular) return obj as Record<string, unknown>;
    }
    return null;
  }

  async metadataCreateObject(data: Record<string, unknown>): Promise<unknown> {
    return this.restRequest("POST", "/rest/metadata/objects", data);
  }

  async metadataCreateField(data: Record<string, unknown>): Promise<unknown> {
    return this.restRequest("POST", "/rest/metadata/fields", data);
  }

  async getCompleteSchema(objectNameSingular: string): Promise<MetadataFieldInfo[]> {
    const cached = this.metadataCache.get(objectNameSingular);
    if (cached) return cached;

    const obj = await this.metadataGetObjectByName(objectNameSingular);
    if (!obj) throw new Error(`Object "${objectNameSingular}" not found in metadata`);

    const fields = (obj.fields ?? []) as any[];
    const result: MetadataFieldInfo[] = fields
      .filter((f) => f.isActive !== false)
      .map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        isCustom: f.isCustom ?? false,
        isNullable: f.isNullable ?? true,
        isSystem: f.isSystem ?? false,
        description: f.description ?? undefined,
      }));

    this.metadataCache.set(objectNameSingular, result);
    return result;
  }

  static formatMetadataSchema(objectName: string, fields: MetadataFieldInfo[]): string {
    const lines: string[] = [`${objectName} fields:`];
    const standard = fields.filter((f) => !f.isCustom && !f.isSystem);
    const custom = fields.filter((f) => f.isCustom);

    for (const f of standard) {
      const desc = f.description ? ` - ${f.description}` : "";
      const nullable = f.isNullable ? "" : " (required)";
      lines.push(`  ${f.name}: ${f.type}${nullable}${desc}`);
    }

    if (custom.length > 0) {
      lines.push(`\n  Custom fields:`);
      for (const f of custom) {
        const desc = f.description ? ` - ${f.description}` : "";
        lines.push(`  ${f.name}: ${f.type}${desc}`);
      }
    }

    return lines.join("\n");
  }

  /** Build a web UI URL for a record. */
  recordUrl(resourceSingular: string, id: string): string {
    return `${this.baseUrl}/object/${resourceSingular}/${id}`;
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

    const result = (await response.json().catch(() => null)) as GraphQLResponse<T> | null;

    if (!response.ok) {
      const detail = result?.errors?.map((e) => e.message).join("; ")
        ?? JSON.stringify(result)
        ?? response.statusText;
      throw new Error(`Twenty API error (${response.status}): ${detail}`);
    }

    if (!result) {
      throw new Error("Twenty API returned unparseable response");
    }

    if (result.errors?.length) {
      const messages = result.errors.map((e) => e.message).join("; ");
      throw new Error(`Twenty GraphQL error: ${messages}`);
    }

    if (!result.data) {
      throw new Error("Twenty API returned no data");
    }

    return result.data;
  }

  /** Raw GraphQL request without operationName (needed for introspection). */
  private async rawQuery<T = unknown>(query: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query }),
    });

    const result = (await response.json().catch(() => null)) as GraphQLResponse<T> | null;

    if (!response.ok || !result?.data) {
      const detail = result?.errors?.map((e) => e.message).join("; ") ?? response.statusText;
      throw new Error(`Introspection failed: ${detail}`);
    }

    if (result.errors?.length) {
      throw new Error(`Introspection error: ${result.errors.map((e) => e.message).join("; ")}`);
    }

    return result.data;
  }

  /** Introspect a GraphQL input type and resolve nested input objects (1 level deep). */
  async introspectInputType(typeName: string): Promise<FieldInfo[]> {
    const cached = this.schemaCache.get(typeName);
    if (cached) return cached;

    const data = await this.rawQuery<{ __type: IntrospectionType | null }>(
      `{ __type(name: "${typeName}") { name inputFields { name type { name kind ofType { name kind ofType { name } } } } } }`,
    );

    if (!data.__type) {
      throw new Error(`Type "${typeName}" not found in schema`);
    }

    // Collect nested INPUT_OBJECT type names to resolve
    const nestedTypeNames = new Set<string>();
    for (const field of data.__type.inputFields) {
      if (field.type.kind === "INPUT_OBJECT" && field.type.name) {
        nestedTypeNames.add(field.type.name);
      }
    }

    // Batch-introspect nested types
    const nestedTypes = new Map<string, IntrospectionField[]>();
    if (nestedTypeNames.size > 0) {
      const subQueries = [...nestedTypeNames].map((n, i) =>
        `t${i}: __type(name: "${n}") { name inputFields { name type { name kind ofType { name kind ofType { name } } } } }`
      ).join(" ");

      const nestedData = await this.rawQuery<Record<string, IntrospectionType | null>>(
        `{ ${subQueries} }`,
      );

      for (const val of Object.values(nestedData)) {
        if (val) nestedTypes.set(val.name, val.inputFields);
      }
    }

    const fields: FieldInfo[] = data.__type.inputFields.map((f) => {
      const typStr = resolveTypeName(f);
      const nested = f.type.kind === "INPUT_OBJECT" && f.type.name
        ? nestedTypes.get(f.type.name)
        : null;

      const info: FieldInfo = { name: f.name, type: typStr };
      if (nested) {
        info.fields = nested.map((nf) => ({ name: nf.name, type: resolveTypeName(nf) }));
      }
      return info;
    });

    this.schemaCache.set(typeName, fields);
    return fields;
  }

  /** Format introspected fields into a readable schema string. */
  static formatSchema(typeName: string, fields: FieldInfo[]): string {
    const lines: string[] = [`${typeName}:`];
    for (const f of fields) {
      if (f.fields) {
        lines.push(`  ${f.name}: { ${f.fields.map((sf) => `${sf.name}: ${sf.type}`).join(", ")} }`);
      } else {
        lines.push(`  ${f.name}: ${f.type}`);
      }
    }
    return lines.join("\n");
  }
}

function resolveTypeName(field: IntrospectionField): string {
  const t = field.type;
  if (t.name) return t.name;
  if (t.kind === "NON_NULL" && t.ofType) {
    if (t.ofType.name) return `${t.ofType.name}!`;
    if (t.ofType.kind === "LIST" && t.ofType.ofType?.name) return `[${t.ofType.ofType.name}]!`;
  }
  if (t.kind === "LIST") {
    if (t.ofType?.name) return `[${t.ofType.name}]`;
    if (t.ofType?.kind === "NON_NULL" && t.ofType.ofType?.name) return `[${t.ofType.ofType.name}!]`;
  }
  if (t.ofType?.name) return t.ofType.name;
  return "unknown";
}
