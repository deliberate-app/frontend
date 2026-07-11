import { describe, expect, test } from 'bun:test';

import { base32, cidFromSha256Digest } from './cid';

const encode = (text: string) => new TextEncoder().encode(text);

describe('base32', () => {
  test('encodes the RFC 4648 vectors (lowercase, unpadded)', () => {
    expect(base32(encode(''))).toBe('');
    expect(base32(encode('f'))).toBe('my');
    expect(base32(encode('fo'))).toBe('mzxq');
    expect(base32(encode('foo'))).toBe('mzxw6');
    expect(base32(encode('foob'))).toBe('mzxw6yq');
    expect(base32(encode('fooba'))).toBe('mzxw6ytb');
    expect(base32(encode('foobar'))).toBe('mzxw6ytboi');
  });
});

describe('cidFromSha256Digest', () => {
  test('builds the CIDv1 a raw-leaves ipfs add produces', async () => {
    // Fixture: sha-256 of "Threatens habitability"; the CID was verified against a live kubo gateway.
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encode('Threatens habitability')));
    expect(cidFromSha256Digest(digest)).toBe('bafkreif3pscuobc3juosiyg7xkh4m6ilkatkg3igpsndpnlr4fzmygoubm');
  });
});
