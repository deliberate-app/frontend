import { afterAll, describe, expect, test } from 'bun:test';
import { hexToBytes } from 'viem';

import { IPFS_GATEWAY_URL, KUBO_API_URL, kuboUp } from '../../scripts/devstack/ipfs';
import { contentURIOf, fetchTextByDigest, publishText, sha256DigestOf, MAX_CONTENT_BYTES } from './ipfs';

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
    const text = 'ArborVote IPFS pipeline round-trip vector';

    const { digest } = await publishText(KUBO_API_URL, text);

    expect(digest).toBe('0xe1315523fad469bcff9695321db9eedf20b2fedf827165eb443c1d1ce32bd1b0');

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
