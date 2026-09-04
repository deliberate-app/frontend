import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import handler from './graphql';

const UPSTREAM = 'https://indexer.example/v1/graphql';
const QUERY = JSON.stringify({ query: '{ Debate(limit:1) { id } }' });

const post = (body = QUERY, headers: Record<string, string> = {}) =>
  new Request('https://www.deliberate.garden/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

describe('the indexer proxy', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.INDEXER_UPSTREAM_URL = UPSTREAM;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.INDEXER_UPSTREAM_URL;
  });

  test('forwards the query upstream and returns the answer', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      return new Response('{"data":{"Debate":[{"id":"0"}]}}', { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const response = await handler(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { Debate: [{ id: '0' }] } });
    expect(calls).toEqual([{ url: UPSTREAM, body: QUERY }]);
  });

  test('passes a throttled response through as the 429 it is, with its rate-limit headers', async () => {
    // The whole point of the proxy: unmasking the failure that read as a CORS error in the app.
    globalThis.fetch = (async () =>
      new Response('rate limited', {
        status: 429,
        headers: { 'x-ratelimit-limit': '100, 100;w=60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '42' },
      })) as unknown as typeof fetch;

    const response = await handler(post());
    expect(response.status).toBe(429);
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(response.headers.get('x-ratelimit-reset')).toBe('42');
  });

  test('reports an unreachable indexer as 502 rather than throwing', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;

    const response = await handler(post());
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('could not be reached');
  });

  test('refuses to forward without an upstream configured', async () => {
    delete process.env.INDEXER_UPSTREAM_URL;
    expect((await handler(post())).status).toBe(503);
  });

  test('rejects a body past the forward cap', async () => {
    expect(await handler(post('x'.repeat(16 * 1024 + 1))).then((r) => r.status)).toBe(413);
  });

  test('rejects anything that is not a POST', async () => {
    const get = new Request('https://www.deliberate.garden/api/graphql', { method: 'GET' });
    expect((await handler(get)).status).toBe(405);
  });

  test('reflects loopback origins for local dev, and no other origin', async () => {
    globalThis.fetch = (async () => new Response('{}')) as unknown as typeof fetch;

    const local = await handler(post(QUERY, { origin: 'http://localhost:5173' }));
    expect(local.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');

    // An arbitrary site must not be able to drive the proxy and the quota behind it.
    const evil = await handler(post(QUERY, { origin: 'https://evil.example' }));
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
