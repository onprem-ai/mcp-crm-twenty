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
