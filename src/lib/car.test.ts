import { describe, expect, test } from 'bun:test';
import { CarBufferReader } from '@ipld/car/buffer-reader';

import { cidFromSha256Digest } from './cid';
import { cidOf, singleBlockCar } from './car';

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

/**
 * The archive is read back with the IPLD reader rather than a decoder written here.
 *
 * An earlier version of this file hand-parsed the CAR to check a hand-written encoder, which
 * cannot catch a shared misreading of the format - both sides would agree on the same mistake.
 * Reading with a separate implementation is what makes the round trip evidence.
 */
describe('singleBlockCar', () => {
  test('carries the content unchanged, rooted at its own raw CID', async () => {
    const data = new TextEncoder().encode('Public transport should be free');
    const digest = await sha256(data);

    const reader = CarBufferReader.fromBytes(singleBlockCar(data, digest));
    const roots = reader.getRoots();
    const block = reader.get(roots[0]!);

    expect(roots).toHaveLength(1);
    // Raw codec (0x55) and CIDv1 are the scheme: they are what make sha-256(content) both the
    // content's hash and the CID's multihash, so the on-chain digest verifies a fetch.
    expect(roots[0]!.code).toBe(0x55);
    expect(roots[0]!.version).toBe(1);
    expect(roots[0]!.toString()).toBe(cidFromSha256Digest(digest));
    expect([...(block?.bytes ?? [])]).toEqual([...data]);
  });

  test('stays correct for content at the publish ceiling', async () => {
    const data = new TextEncoder().encode('x'.repeat(250));
    const digest = await sha256(data);

    const reader = CarBufferReader.fromBytes(singleBlockCar(data, digest));
    const root = reader.getRoots()[0]!;

    expect(root.toString()).toBe(cidFromSha256Digest(digest));
    expect([...(reader.get(root)?.bytes ?? [])]).toEqual([...data]);
  });
});

describe('cidOf', () => {
  test('is the raw-leaves CIDv1 prefix followed by the digest', async () => {
    const digest = await sha256(new TextEncoder().encode('hi'));
    const bytes = cidOf(digest).bytes;

    expect(bytes.length).toBe(36);
    expect([...bytes.subarray(0, 4)]).toEqual([0x01, 0x55, 0x12, 0x20]);
    expect([...bytes.subarray(4)]).toEqual([...digest]);
  });

  test('refuses anything that is not a sha-256 digest', () => {
    expect(() => cidOf(new Uint8Array(31))).toThrow('32 bytes');
  });
});
