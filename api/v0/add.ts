/**
 * A kubo-shaped pinning proxy for the hosted frontend (a Vercel edge function).
 *
 * `publishText` POSTs the same multipart body to `{VITE_IPFS_API}/api/v0/add` it would
 * send to a kubo node; with `VITE_IPFS_API=/` that lands here same-origin, and the text
 * is pinned on Filebase instead. The credentials stay server-side - the browser never
 * holds them. The response is kubo's `{Hash: <cid>}`, so the client needs no
 * Filebase-specific code and keeps verifying the CID against its local digest.
 *
 * Filebase pins through its S3-compatible API: a SigV4-signed PUT whose response carries the
 * resulting CID in `x-amz-meta-cid`. The object key is the CID the content must have, which
 * makes a re-publish of the same text idempotent and the bucket browsable by the identifier
 * the chain stores.
 *
 * The upload is a CAR, not the loose bytes, because the CID is not Filebase's to choose. The
 * contentURI scheme requires the raw-leaves CIDv1 wrapping the sha-256 digest
 * (`0x01 0x55 0x12 0x20 + digest`), and Filebase re-chunks loose bytes through UnixFS: measured
 * against the live API, it returned the dag-pb CIDv0 `QmdXgh…` for content whose raw CID is
 * `bafkreief4v…`. A CAR carries its own block and names its own root, so the importer stores
 * what it is given and the CID is settled before the request leaves this function.
 *
 * The CID check after the upload stays regardless. It costs nothing and it is the one thing
 * standing between a service that quietly re-encodes content and a digest on chain that resolves
 * to nothing.
 */
import { AwsClient } from 'aws4fetch';

import { singleBlockCar } from '../../src/lib/car';
import { cidFromSha256Digest } from '../../src/lib/cid';
import { corsFor } from '../../src/lib/devCors';
import { MAX_CONTENT_BYTES } from '../../src/lib/ipfs';

export const config = { runtime: 'edge' };

const FILEBASE_S3_ENDPOINT = 'https://s3.filebase.com';

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

  const accessKeyId = process.env.FILEBASE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.FILEBASE_SECRET_ACCESS_KEY;
  const bucket = process.env.FILEBASE_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) {
    return new Response(
      'pinning is not configured (FILEBASE_ACCESS_KEY_ID, FILEBASE_SECRET_ACCESS_KEY and FILEBASE_BUCKET are required)',
      { status: 503, headers: cors },
    );
  }

  let file: Blob | null = null;
  try {
    const field: unknown = (await request.formData()).get('file');
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

  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'us-east-1' });
  const objectUrl = `${FILEBASE_S3_ENDPOINT}/${bucket}/${expectedCid}`;

  let response: Response;
  try {
    response = await client.fetch(objectUrl, {
      method: 'PUT',
      body: singleBlockCar(bytes, digest),
      headers: {
        'content-type': 'application/vnd.ipld.car',
        // Import the archive's own block rather than re-chunking the body as a new file.
        'x-amz-meta-import': 'car',
      },
    });
  } catch (error: unknown) {
    return new Response(`Filebase could not be reached: ${String(error)}`, { status: 502, headers: cors });
  }
  if (!response.ok) {
    return new Response(`Filebase rejected the upload with status ${response.status}`, { status: 502, headers: cors });
  }

  // The CID rides back on the PUT, but a HEAD of the object we just wrote is the documented
  // way to read it and costs one request only when the PUT did not carry it.
  let cid = response.headers.get('x-amz-meta-cid');
  if (cid === null) {
    const head = await client.fetch(objectUrl, { method: 'HEAD' }).catch(() => null);
    cid = head?.headers.get('x-amz-meta-cid') ?? null;
  }
  if (cid === null) {
    return new Response('Filebase accepted the upload but reported no CID for it', { status: 502, headers: cors });
  }
  if (cid !== expectedCid) {
    return new Response(
      `Filebase pinned ${cid}, not the raw-leaves CID ${expectedCid} the contentURI scheme requires - ` +
        'the CAR import did not preserve the root it was given',
      { status: 502, headers: cors },
    );
  }
  return Response.json({ Hash: cid }, { headers: cors });
}
