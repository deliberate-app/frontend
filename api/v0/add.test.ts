import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { cidFromSha256Digest } from '../../src/lib/cid';
import { MAX_CONTENT_BYTES } from '../../src/lib/ipfs';
import handler from './add';

const realFetch = globalThis.fetch;

async function cidOf(bytes: Uint8Array): Promise<string> {
  return cidFromSha256Digest(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function addRequest(bytes: Uint8Array, origin?: string): Request {
  const form = new FormData();
  form.append('file', new Blob([bytes]));
  return new Request('http://localhost/api/v0/add?quiet=true&raw-leaves=true&cid-version=1&pin=true', {
    method: 'POST',
    body: form,
    headers: origin === undefined ? {} : { origin },
  });
}

/** Replaces fetch with a stub answering as Pinata; returns the captured request for assertions. */
function stubPinata(reply: { status: number; cid?: string }): { url?: string; init?: RequestInit } {
  const captured: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.url = String(url);
    captured.init = init;
    return reply.status === 200
      ? Response.json({ data: { cid: reply.cid } })
      : new Response('nope', { status: reply.status });
  }) as typeof fetch;
  return captured;
}

describe('the /api/v0/add pin proxy', () => {
  beforeEach(() => {
    process.env.PINATA_JWT = 'test-jwt';
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.PINATA_JWT;
  });

  test('pins through Pinata and answers in kubo shape', async () => {
    const bytes = new TextEncoder().encode('An argument text.');
    const cid = await cidOf(bytes);
    const captured = stubPinata({ status: 200, cid });

    const response = await handler(addRequest(bytes));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ Hash: cid });
    expect(captured.url).toBe('https://uploads.pinata.cloud/v3/files');
    expect((captured.init?.headers as Record<string, string>).Authorization).toBe('Bearer test-jwt');
    const forwarded = captured.init?.body as FormData;
    expect(forwarded.get('network')).toBe('public');
  });

  test('rejects a Pinata CID that does not wrap the content digest', async () => {
    const bytes = new TextEncoder().encode('An argument text.');
    stubPinata({ status: 200, cid: 'bafkreisomethingelse' });

    const response = await handler(addRequest(bytes));

    expect(response.status).toBe(502);
    expect(await response.text()).toContain(await cidOf(bytes));
  });

  test('passes a Pinata failure through as a 502', async () => {
    stubPinata({ status: 401 });
    expect((await handler(addRequest(new Uint8Array([1])))).status).toBe(502);
  });

  test('rejects content above the single-block limit before uploading', async () => {
    const captured = stubPinata({ status: 200, cid: 'unused' });
    const response = await handler(addRequest(new Uint8Array(MAX_CONTENT_BYTES + 1)));
    expect(response.status).toBe(413);
    expect(captured.url).toBeUndefined();
  });

  test('rejects a body without a file field', async () => {
    const response = await handler(new Request('http://localhost/api/v0/add', { method: 'POST', body: 'text' }));
    expect(response.status).toBe(400);
  });

  test('rejects non-POST requests', async () => {
    expect((await handler(new Request('http://localhost/api/v0/add'))).status).toBe(405);
  });

  test('answers 503 when no credential is configured', async () => {
    delete process.env.PINATA_JWT;
    expect((await handler(addRequest(new Uint8Array([1])))).status).toBe(503);
  });

  test('answers a local dev preflight and reflects the loopback origin', async () => {
    const response = await handler(
      new Request('http://localhost/api/v0/add', {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST');
  });

  test('lets a local dev origin read the pin response', async () => {
    const bytes = new TextEncoder().encode('An argument text.');
    stubPinata({ status: 200, cid: await cidOf(bytes) });
    const response = await handler(addRequest(bytes, 'http://127.0.0.1:5173'));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });

  test('does not open the proxy to foreign origins', async () => {
    const bytes = new TextEncoder().encode('An argument text.');
    stubPinata({ status: 200, cid: await cidOf(bytes) });
    const response = await handler(addRequest(bytes, 'https://evil.example'));
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
