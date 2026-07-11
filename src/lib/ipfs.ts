/**
 * The argument content pipeline. The contract stores each argument's content as a
 * bytes32 contentURI - the sha-256 multihash digest of an IPFS raw-leaves block
 * (a full CID does not fit in 32 bytes; its digest does):
 *
 * - `publishText` uploads and pins a text on a kubo-compatible RPC API and returns
 *   the digest for on-chain use, asserting the pinned CID wraps exactly that digest.
 * - `fetchTextByDigest` resolves a digest back to its text through an IPFS gateway
 *   and verifies the received bytes hash to the digest - gateways are untrusted.
 *
 * Publish before sending the transaction that references the digest: a failed
 * transaction leaves nothing behind but a harmless pinned text block.
 */

import { toHex, type Hex } from 'viem';

import { cidFromSha256Digest } from './cid';

/**
 * kubo's default chunking limit: larger content is split into a multi-block DAG whose
 * root CID no longer wraps the content's sha-256 digest, so a single bytes32 contentURI
 * can only ever reference a text up to this size.
 */
export const MAX_CONTENT_BYTES = 256 * 1024;

/** The sha-256 digest of the text - the raw bytes of the on-chain contentURI. */
export async function sha256DigestOf(text: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(text));
}

/** The bytes32 contentURI the contract stores for the text. */
export async function contentURIOf(text: string): Promise<Hex> {
  return toHex(await sha256DigestOf(text));
}

export interface PublishedContent {
  /** The bytes32 contentURI for on-chain use. */
  digest: Hex;
  /** The CIDv1 (raw codec) under which the text resolves on any gateway. */
  cid: string;
}

/**
 * Adds and pins the text on a kubo-compatible RPC API (`{apiUrl}/api/v0/add`) as a
 * raw-leaves CIDv1 block. Throws for content above `MAX_CONTENT_BYTES` (it could not
 * be referenced by a single digest) and when the node reports a CID that does not
 * wrap the locally computed digest - the on-chain reference and the pinned content
 * can never drift apart.
 */
export async function publishText(apiUrl: string, text: string): Promise<PublishedContent> {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MAX_CONTENT_BYTES) {
    throw new Error(
      `argument content is ${bytes.byteLength} bytes - a single raw-leaves block holds at most ${MAX_CONTENT_BYTES}`,
    );
  }
  const digest = await sha256(bytes);
  const expectedCid = cidFromSha256Digest(digest);

  const form = new FormData();
  form.append('file', new Blob([bytes]));
  const response = await fetch(
    `${apiUrl.replace(/\/$/, '')}/api/v0/add?quiet=true&raw-leaves=true&cid-version=1&pin=true`,
    { method: 'POST', body: form },
  );
  if (!response.ok) {
    throw new Error(`IPFS add failed with status ${response.status}`);
  }
  const { Hash: cid } = (await response.json()) as { Hash: string };
  if (cid !== expectedCid) {
    throw new Error(`pinned CID ${cid} does not match the content digest CID ${expectedCid}`);
  }

  return { digest: toHex(digest), cid };
}

/**
 * Resolves argument content by its on-chain digest from an IPFS gateway. The gateway
 * is untrusted: the response is size-capped while streaming and must hash back to the
 * digest, otherwise null is returned - as it is when the gateway cannot provide the
 * content in time.
 */
export async function fetchTextByDigest(
  gatewayUrl: string,
  digest: Uint8Array,
  timeoutMs = 8000,
): Promise<string | null> {
  const cid = cidFromSha256Digest(digest);
  try {
    const response = await fetch(`${gatewayUrl.replace(/\/$/, '')}/ipfs/${cid}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    const bytes = await readCapped(response, MAX_CONTENT_BYTES);
    if (bytes === null) {
      return null;
    }
    if (!bytesEqual(await sha256(bytes), digest)) {
      console.warn(`IPFS gateway returned content not matching its digest for ${cid}`);
      return null;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** Reads the response body up to maxBytes; null when the (untrusted) body exceeds it. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    total += read.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(read.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
