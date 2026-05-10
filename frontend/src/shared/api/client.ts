export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
}

export class ApiHttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export class UnauthorizedError extends ApiHttpError {
  constructor(body: unknown) { super(401, body, 'unauthorized'); }
}

export class ApiClient {
  private opts: ApiClientOptions;
  constructor(opts: ApiClientOptions) {
    this.opts = opts;
  }

  get<T>(path: string): Promise<T>            { return this.request<T>('GET', path); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    const token = this.opts.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
    });

    if (res.status === 204) return null as T;

    const text = await res.text();
    let parsed: unknown;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

    if (res.status === 401) {
      this.opts.onUnauthorized();
      throw new UnauthorizedError(parsed);
    }
    if (res.status >= 400) throw new ApiHttpError(res.status, parsed);
    return parsed as T;
  }
}
