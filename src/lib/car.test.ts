import { describe, expect, test } from 'bun:test';

import { cidFromSha256Digest } from './cid';
import { cidBytesFromSha256Digest, singleBlockCar, varint } from './car';

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

/**
 * Reads a CARv1 back out: the root CID named in its header, and the one block it carries.
 *
 * The archive is hand-encoded, so the test decodes rather than compares to a golden blob - a
 * byte-for-byte fixture would pass just as happily on a header the encoder and the fixture are
 * wrong about together.
 */
function parseCar(car: Uint8Array): { root: Uint8Array; blockCid: Uint8Array; data: Uint8Array } {
  let at = 0;
  const readVarint = (): number => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = car[at++] as number;
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
  };

  // Read the length, then slice - `subarray(at, (at += readVarint()))` evaluates its first
  // argument before the second and so includes the prefix byte in the slice.
  const headerLength = readVarint();
  const header = car.subarray(at, at + headerLength);
  at += headerLength;
  // The root link is the 36 bytes following the tag(42) byte-string prefix and its 0x00 multibase
  // marker: d8 2a 58 <len> 00 <cid>.
  const tagAt = header.findIndex((byte, i) => byte === 0xd8 && header[i + 1] === 0x2a);
  expect(tagAt).toBeGreaterThanOrEqual(0);
  const linkLength = header[tagAt + 3] as number;
  expect(header[tagAt + 4]).toBe(0x00);
  const root = header.subarray(tagAt + 5, tagAt + 4 + linkLength);

  const blockLength = readVarint();
  const block = car.subarray(at, at + blockLength);
  expect(block.length).toBe(blockLength);
  return { root, blockCid: block.subarray(0, 36), data: block.subarray(36) };
}

describe('varint', () => {
  test('encodes single-byte values verbatim', () => {
    expect([...varint(0)]).toEqual([0x00]);
    expect([...varint(58)]).toEqual([0x3a]);
    expect([...varint(127)]).toEqual([0x7f]);
  });

  test('continues into a second byte past 127', () => {
    expect([...varint(128)]).toEqual([0x80, 0x01]);
    // 36-byte CID plus a 250-byte argument: the realistic upper end for this app.
    expect([...varint(286)]).toEqual([0x9e, 0x02]);
  });

  test('refuses a value that is not a non-negative integer', () => {
    expect(() => varint(-1)).toThrow();
    expect(() => varint(1.5)).toThrow();
  });
});

describe('cidBytesFromSha256Digest', () => {
  test('is the raw-leaves CIDv1 prefix followed by the digest', async () => {
    const digest = await sha256(new TextEncoder().encode('hi'));
    const bytes = cidBytesFromSha256Digest(digest);
    expect(bytes.length).toBe(36);
    expect([...bytes.subarray(0, 4)]).toEqual([0x01, 0x55, 0x12, 0x20]);
    expect([...bytes.subarray(4)]).toEqual([...digest]);
  });

  test('refuses anything that is not a sha-256 digest', () => {
    expect(() => cidBytesFromSha256Digest(new Uint8Array(31))).toThrow('32 bytes');
  });
});

describe('singleBlockCar', () => {
  test('carries the content unchanged, rooted at its own raw CID', async () => {
    const data = new TextEncoder().encode('Public transport should be free');
    const digest = await sha256(data);

    const { root, blockCid, data: carried } = parseCar(singleBlockCar(data, digest));

    // The root, the block's own CID, and the CID the app derives from the on-chain digest are
    // all the same thing - which is the entire point of shipping a CAR instead of loose bytes.
    expect([...root]).toEqual([...cidBytesFromSha256Digest(digest)]);
    expect([...blockCid]).toEqual([...root]);
    expect([...carried]).toEqual([...data]);
    expect(cidFromSha256Digest(digest).startsWith('bafkrei')).toBe(true);
  });

  test('length prefixes match the sections they introduce', async () => {
    const data = new TextEncoder().encode('hi');
    const digest = await sha256(data);
    const car = singleBlockCar(data, digest);

    // varint(58) header, 58-byte header, varint(38) block, 36-byte CID, 2 bytes of content.
    expect(car.length).toBe(1 + 58 + 1 + 36 + 2);
    expect(car[0]).toBe(58);
    expect(car[1]).toBe(0xa2); // the header is a 2-entry map
    expect(car[1 + 58]).toBe(38);
  });

  test('stays correct for content long enough to need a two-byte length prefix', async () => {
    const data = new TextEncoder().encode('x'.repeat(250));
    const digest = await sha256(data);

    const { root, data: carried } = parseCar(singleBlockCar(data, digest));

    expect(carried.length).toBe(250);
    expect([...carried]).toEqual([...data]);
    expect([...root]).toEqual([...cidBytesFromSha256Digest(digest)]);
  });
});
