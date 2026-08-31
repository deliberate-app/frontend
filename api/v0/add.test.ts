import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { singleBlockCar } from '../../src/lib/car';
import { cidFromSha256Digest } from '../../src/lib/cid';
import { MAX_CONTENT_BYTES } from '../../src/lib/ipfs';
import handler from './add';

const realFetch = globalThis.fetch;

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

async function cidOf(bytes: Uint8Array): Promise<string> {
  return cidFromSha256Digest(await sha256(bytes));
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

/**
 * Replaces fetch with a stub answering as Filebase's S3 API; returns the captured request.
 *
 * aws4fetch signs and then calls global fetch with a Request, so the stub reads the URL and
 * method off that - which also lets the signature itself be asserted as present.
 */
interface Captured {
  url?: string;
  method?: string;
  auth?: string;
  importMode?: string;
  body?: Uint8Array;
}

function stubFilebase(reply: { status: number; cid?: string }): Captured {
  const captured: Captured = {};
  globalThis.fetch = (async (input: string | URL | Request) => {
    const request = input as Request;
    captured.url = request.url ?? String(input);
    captured.method = request.method;
    captured.auth = request.headers?.get('authorization') ?? undefined;
    captured.importMode = request.headers?.get('x-amz-meta-import') ?? undefined;
    captured.body = new Uint8Array(await request.arrayBuffer());
    const headers: Record<string, string> = {};
    if (reply.cid !== undefined) headers['x-amz-meta-cid'] = reply.cid;
    return new Response(null, { status: reply.status, headers });
  }) as typeof fetch;
  return captured;
}

describe('the /api/v0/add pin proxy', () => {
  beforeEach(() => {
    process.env.FILEBASE_ACCESS_KEY_ID = 'test-key-id';
    process.env.FILEBASE_SECRET_ACCESS_KEY = 'test-secret';
    process.env.FILEBASE_BUCKET = 'test-bucket';
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.FILEBASE_ACCESS_KEY_ID;
    delete process.env.FILEBASE_SECRET_ACCESS_KEY;
    delete process.env.FILEBASE_BUCKET;
  });

  test('pins through Filebase and answers in kubo shape', async () => {
    const bytes = new TextEncoder().encode('An argument text.');
    const cid = await cidOf(bytes);
    const captured = stubFilebase({ status: 200, cid });

    const response = await handler(addRequest(bytes));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ Hash: cid });
    // The object key is the CID the content must have, so a re-publish overwrites itself.
    expect(captured.url).toBe(`https://s3.filebase.com/test-bucket/${cid}`);
    expect(captured.method).toBe('PUT');
    expect(captured.auth).toContain('AWS4-HMAC-SHA256');
    // A CAR, imported as one - not loose bytes for Filebase to re-chunk into a dag-pb CID.
    expect(captured.importMode).toBe('car');
    expect([...(captured.body as Uint8Array)]).toEqual([...singleBlockCar(bytes, await sha256(bytes))]);
  });

  test('rejects a Filebase CID that does not wrap the content digest', async () => {
    // The assertion that establishes what Filebase emits: a UnixFS/dag-pb CID for the same
    // bytes must fail the publish rather than put an unresolvable digest on chain.
    const bytes = new TextEncoder().encode('An argument text.');
    stubFilebase({ status: 200, cid: 'bafybeisomethingelse' });

    const response = await handler(addRequest(bytes));

    const message = await response.text();
    expect(response.status).toBe(502);
    expect(message).toContain(await cidOf(bytes));
    expect(message).toContain('did not preserve the root');
  });

  test('fails when Filebase accepts the upload but reports no CID', async () => {
    stubFilebase({ status: 200 });
    const response = await handler(addRequest(new Uint8Array([1])));
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('no CID');
  });

  test('passes a Filebase failure through as a 502', async () => {
    stubFilebase({ status: 403 });
    expect((await handler(addRequest(new Uint8Array([1])))).status).toBe(502);
  });

  test('rejects content above the single-block limit before uploading', async () => {
    const captured = stubFilebase({ status: 200, cid: 'unused' });
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
    delete process.env.FILEBASE_ACCESS_KEY_ID;
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
    stubFilebase({ status: 200, cid: await cidOf(bytes) });
    const response = await handler(addRequest(bytes, 'http://127.0.0.1:5173'));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });

  test('does not open the proxy to foreign origins', async () => {
    const bytes = new TextEncoder().encode('An argument text.');
    stubFilebase({ status: 200, cid: await cidOf(bytes) });
    const response = await handler(addRequest(bytes, 'https://evil.example'));
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
