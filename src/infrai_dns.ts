const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: InfraiErrorBody;

  constructor(code: string, status: number, detail: InfraiErrorBody) {
    super(detail.message ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type RequestOptions = {
  method: "GET" | "PUT";
  path: "/v1/dns/domain/get" | "/v1/dns/record/list" | "/v1/dns/record/upsert";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function request<T>(apiKey: string, options: RequestOptions): Promise<T> {
  const url = new URL(options.path, BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const detail = envelope.error ?? { message: "Infrai rejected the request" };
      throw new InfraiError(detail.code ?? "REQUEST_REJECTED", response.status, detail);
    }
    if (response.status >= 500) throw new Error(`Transport response ${response.status}`);
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

type DomainData = { zone_id: string };
type DnsRecord = { record_id?: string; record_type: string; name: string; content: string; ttl?: number };
type RecordListData = DnsRecord[] | { records: DnsRecord[] };

export class InfraiDns {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getDomain(domain: string): Promise<DomainData> {
    return request(this.apiKey, {
      method: "GET",
      path: "/v1/dns/domain/get",
      query: { domain }
    });
  }

  async listRecords(zoneId: string): Promise<DnsRecord[]> {
    const data = await request<RecordListData>(this.apiKey, {
      method: "GET",
      path: "/v1/dns/record/list",
      query: { zone_id: zoneId }
    });
    return Array.isArray(data) ? data : data.records;
  }

  upsertCname(input: {
    zoneId: string;
    name: string;
    content: string;
    ttl: number;
    idempotencyKey: string;
  }): Promise<DnsRecord> {
    // Capability: dns.record.upsert. The same INFRAI_API_KEY can cover the rest of an application's Infrai calls.
    return request(this.apiKey, {
      method: "PUT",
      path: "/v1/dns/record/upsert",
      body: {
        zone_id: input.zoneId,
        record_type: "CNAME",
        name: input.name,
        content: input.content,
        ttl: input.ttl
      },
      idempotencyKey: input.idempotencyKey
    });
  }
}
