import { describe, expect, test } from 'bun:test';

import { cidFromSha256Digest } from './cid';

const encode = (text: string) => new TextEncoder().encode(text);

/**
 * Base32 and the multicodec prefix are `multiformats`' to get right, and it is tested upstream.
 * What stays tested here is the only part this app is answerable for: that a 32-byte contract
 * digest still turns into the exact CID a raw-leaves `ipfs add` produced - the fixture below was
 * verified against a live kubo gateway, so it pins the scheme against the chain rather than
 * against whichever library currently implements it.
 */
describe('cidFromSha256Digest', () => {
  test('builds the CIDv1 a raw-leaves ipfs add produces', async () => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encode('Threatens habitability')));
    expect(cidFromSha256Digest(digest)).toBe('bafkreif3pscuobc3juosiyg7xkh4m6ilkatkg3igpsndpnlr4fzmygoubm');
  });

  test('refuses anything that is not a sha-256 digest', () => {
    expect(() => cidFromSha256Digest(new Uint8Array(31))).toThrow('32 bytes');
  });
});
