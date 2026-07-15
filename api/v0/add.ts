/**
 * A kubo-shaped pinning proxy for the hosted frontend (a Vercel edge function).
 *
 * `publishText` POSTs the same multipart body to `{VITE_IPFS_API}/api/v0/add` it would
 * send to a kubo node; with `VITE_IPFS_API=/` that lands here same-origin, and the text
 * is pinned on Pinata instead. The credential (`PINATA_JWT`) stays server-side - the
 * browser never holds it. The response is kubo's `{Hash: <cid>}`, so the client needs
 * no Pinata-specific code and keeps verifying the CID against its local digest.
 */
import { cidFromSha256Digest } from '../../src/lib/cid';
import { MAX_CONTENT_BYTES } from '../../src/lib/ipfs';

export const config = { runtime: 'edge' };

const PINATA_UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files';

/**
 * The hosted app calls this same-origin, but local dev servers (`just dev-testnet`) point
 * `VITE_IPFS_API` at the deployment and arrive cross-origin. Only loopback origins are
 * reflected - anything wider would open the proxy (and the Pinata quota behind it) to
 * pinning from arbitrary websites.
 */
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsFor(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  return origin !== null && DEV_ORIGIN.test(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

export default async function handler(request: Request): Promise<Response> {
  const cors = corsFor(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? 'content-type',
      },
    });
  }
  if (request.method !== 'POST') {
    return new Response('only POST is supported', { status: 405, headers: cors });
  }
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return new Response('pinning is not configured (PINATA_JWT is unset)', { status: 503, headers: cors });
  }

  let file: Blob | null = null;
  try {
    const field = (await request.formData()).get('file');
    file = field instanceof Blob ? field : null;
  } catch {
    // Not a multipart body; fall through to the 400 below.
  }
  if (file === null) {
    return new Response("expected a multipart body with a 'file' field", { status: 400, headers: cors });
  }
  if (file.size > MAX_CONTENT_BYTES) {
    return new Response(
      `content is ${file.size} bytes - a single raw-leaves block holds at most ${MAX_CONTENT_BYTES}`,
      { status: 413, headers: cors },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const expectedCid = cidFromSha256Digest(digest);

  const upload = new FormData();
  upload.append('file', new File([bytes], expectedCid, { type: 'application/octet-stream' }));
  // Private files (the v3 default) would not resolve on IPFS gateways.
  upload.append('network', 'public');

  const response = await fetch(PINATA_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: upload,
  });
  if (!response.ok) {
    return new Response(`Pinata rejected the upload with status ${response.status}`, { status: 502, headers: cors });
  }
  const { data } = (await response.json()) as { data: { cid: string } };
  if (data.cid !== expectedCid) {
    // The bytes32 contentURI scheme needs the raw-leaves CIDv1 that wraps the sha-256 digest.
    return new Response(`Pinata pinned ${data.cid}, not the raw-leaves CID ${expectedCid}`, {
      status: 502,
      headers: cors,
    });
  }
  return Response.json({ Hash: data.cid }, { headers: cors });
}
