import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { hexToBytes } from 'viem';

import { IPFS_GATEWAY_URL, KUBO_API_URL, kuboUp } from '../../scripts/devstack/ipfs';
import { contentURIOf, fetchTextByDigest, publishText, sha256DigestOf, warmGateway, MAX_CONTENT_BYTES } from './ipfs';

const kuboAvailable = await kuboUp();

describe('contentURIOf', () => {
  test('is the sha-256 digest of the text', async () => {
    expect(await contentURIOf('Threatens habitability')).toBe(
      '0xbb7c8547045b4d1d2460dfba8fc6790b5026a36d067c9a37b571e172cc19d40b',
    );
    expect(await contentURIOf('Fight climate change?')).toBe(
      '0x1949734e19f2462086d3e4039fa13f07546b47f8d15575b34f893bb42fd1bb9c',
    );
  });
});

describe('publishText', () => {
  test('rejects content above the single-block limit before touching the node', async () => {
    // The guard throws before any request, so no node needs to be running.
    expect(publishText(KUBO_API_URL, 'x'.repeat(MAX_CONTENT_BYTES + 1))).rejects.toThrow(
      /single raw-leaves block holds at most/,
    );
  });

  test.skipIf(!kuboAvailable)('pins content that resolves by its on-chain digest (live kubo)', async () => {
    const text = 'Deliberate IPFS pipeline round-trip vector';

    const { digest } = await publishText(KUBO_API_URL, text);

    expect(digest).toBe('0x6d198ae501fde3ace9ed12bc3398260bb12aea01f62c7b160080f8de2ac8b2d6');

    const roundTrip = await fetchTextByDigest(IPFS_GATEWAY_URL, hexToBytes(digest));
    expect(roundTrip).toBe(text);
  });
});

describe('fetchTextByDigest', () => {
  const text = 'original argument text';
  const servers: Array<{ stop(): void }> = [];

  const gatewayServing = (body: string | Uint8Array): string => {
    const server = Bun.serve({ port: 0, fetch: () => new Response(body) });
    servers.push(server);
    return `http://127.0.0.1:${server.port}`;
  };

  afterAll(() => {
    for (const server of servers) server.stop();
  });

  test('returns content whose bytes hash to the digest', async () => {
    const gateway = gatewayServing(text);
    expect(await fetchTextByDigest(gateway, await sha256DigestOf(text))).toBe(text);
  });

  test('rejects content from a tampering gateway', async () => {
    const gateway = gatewayServing('tampered argument text');
    expect(await fetchTextByDigest(gateway, await sha256DigestOf(text))).toBeNull();
  });

  test('rejects oversized responses without buffering them', async () => {
    const gateway = gatewayServing(new Uint8Array(MAX_CONTENT_BYTES + 1));
    expect(await fetchTextByDigest(gateway, await sha256DigestOf(text))).toBeNull();
  });

  test('returns null when the gateway is unreachable', async () => {
    expect(await fetchTextByDigest('http://127.0.0.1:59999', await sha256DigestOf(text), 500)).toBeNull();
  });
});

describe('read-your-writes', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const TEXT = 'A text this session published.';

  test('serves a text this session published without asking the gateway', async () => {
    // The publish is stubbed to answer as the pin proxy does, so the cache is populated the way
    // a real publish populates it.
    const digest = await sha256DigestOf(TEXT);
    const cid = (await import('./cid')).cidFromSha256Digest(digest);
    globalThis.fetch = (async () => Response.json({ Hash: cid })) as unknown as typeof fetch;
    await publishText('http://pin.example', TEXT);

    // Any gateway read after this must not reach the network at all.
    let asked = false;
    globalThis.fetch = (async () => {
      asked = true;
      throw new Error('the gateway must not be asked for a text this session published');
    }) as unknown as typeof fetch;

    expect(await fetchTextByDigest('http://gateway.example', digest)).toBe(TEXT);
    expect(asked).toBe(false);
  });

  test('still reads the gateway for a text this session did not publish', async () => {
    const other = 'A text published by somebody else.';
    const digest = await sha256DigestOf(other);
    globalThis.fetch = (async () => new Response(other)) as unknown as typeof fetch;

    expect(await fetchTextByDigest('http://gateway.example', digest)).toBe(other);
  });
});

describe('warmGateway', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('asks the gateway for the CID once', () => {
    const asked: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      asked.push(String(url));
      return new Response('ok');
    }) as unknown as typeof fetch;

    warmGateway('http://gateway.example/', 'bafkreitest');

    expect(asked).toEqual(['http://gateway.example/ipfs/bafkreitest']);
  });

  test('does nothing without a gateway, and never throws when one fails', () => {
    globalThis.fetch = (async () => {
      throw new Error('gateway down');
    }) as unknown as typeof fetch;

    // Warming is best-effort: a publish must not fail because priming a cache did.
    expect(() => warmGateway(undefined, 'bafkreitest')).not.toThrow();
    expect(() => warmGateway('http://gateway.example', 'bafkreitest')).not.toThrow();
  });
});
