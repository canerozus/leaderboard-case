import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiClient, ApiHttpError, UnauthorizedError } from './client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function mockFetch(response: { status: number; json?: unknown; text?: string }) {
  globalThis.fetch = vi.fn(async () => new Response(
    response.json !== undefined ? JSON.stringify(response.json) : (response.text ?? ''),
    { status: response.status, headers: { 'content-type': 'application/json' } },
  )) as unknown as typeof fetch;
}

describe('ApiClient', () => {
  test('GET attaches Authorization header when token getter returns one', async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const client = new ApiClient({ baseUrl: '/api/v1', getToken: () => 'tok-123', onUnauthorized: () => {} });
    await client.get('/me');
    expect((calls[0]!.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  test('GET parses JSON on 2xx', async () => {
    mockFetch({ status: 200, json: { hello: 'world' } });
    const client = new ApiClient({ baseUrl: '/api/v1', getToken: () => null, onUnauthorized: () => {} });
    expect(await client.get<{ hello: string }>('/x')).toEqual({ hello: 'world' });
  });

  test('returns null body on 204', async () => {
    mockFetch({ status: 204 });
    const client = new ApiClient({ baseUrl: '/api/v1', getToken: () => null, onUnauthorized: () => {} });
    expect(await client.post('/score/submit', { delta: 1 })).toBeNull();
  });

  test('throws ApiHttpError on 4xx with parsed JSON error', async () => {
    mockFetch({ status: 409, json: { error: 'username_taken', message: 'taken' } });
    const client = new ApiClient({ baseUrl: '/api/v1', getToken: () => null, onUnauthorized: () => {} });
    await expect(client.post('/auth/register', {})).rejects.toMatchObject({
      status: 409, body: { error: 'username_taken', message: 'taken' },
    });
    await expect(client.post('/auth/register', {})).rejects.toBeInstanceOf(ApiHttpError);
  });

  test('throws UnauthorizedError on 401 and fires onUnauthorized', async () => {
    mockFetch({ status: 401, json: { error: 'unauthorized', message: 'no' } });
    const onUnauthorized = vi.fn();
    const client = new ApiClient({ baseUrl: '/api/v1', getToken: () => 'tok', onUnauthorized });
    await expect(client.get('/me')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
