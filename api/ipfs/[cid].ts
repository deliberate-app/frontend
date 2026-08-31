/**
 * A same-origin read proxy in front of the deployment's authorized IPFS gateway.
 *
 * The gateway is private and key-authorized, and a browser cannot hold that key: every
 * `VITE_*` variable is inlined into the public bundle, so a gateway credential shipped to the
 * client is a published credential. The browser therefore reads `/api/ipfs/<cid>` on its own
 * origin, and the credential is attached here.
 *
 * Two things fall out of that, both worth more than the hop costs.
 *
 * Content addressed by its own hash is immutable, so this response can be cached permanently -
 * the CDN answers repeat reads and the gateway sees almost none of them. (The indexer proxy
 * next door deliberately does not cache, because a debate's state changes and two of its
 * readers require freshness. The opposite is true here: `bafkrei…` names one specific sequence
 * of bytes for ever.)
 *
 * And it collapses the read path to a single gateway on a single origin, which removes the
 * multi-gateway race the client used to run - the race existed because a public gateway may not
 * yet have found a provider for freshly pinned content, and a gateway that holds the pins has
 * nothing to find.
 */
import { CID } from 'multiformats/cid';

import { corsFor } from '../../src/lib/devCors';
import { MAX_CONTENT_BYTES } from '../../src/lib/ipfs';

export const config = { runtime: 'edge' };

/** A year. The bytes behind a CID cannot change, so nothing here can go stale. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

export default async function handler(request: Request): Promise<Response> {
  // `just dev-testnet` serves the app from localhost through Vite, which does not run these
  // functions - so a local dev server reads through the deployed proxy, cross-origin.
  const cors = corsFor(request);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('only GET is supported', { status: 405, headers: cors });
  }

  const gateway = process.env.FILEBASE_GATEWAY_URL;
  const token = process.env.FILEBASE_GATEWAY_TOKEN;
  if (!gateway || !token) {
    return new Response('the gateway proxy is not configured (FILEBASE_GATEWAY_URL and FILEBASE_GATEWAY_TOKEN)', {
      status: 503,
      headers: cors,
    });
  }

  const requested = new URL(request.url).pathname.split('/').pop() ?? '';

  // Parsed, not pattern-matched, and then checked against the one shape this app publishes: a
  // raw-codec CIDv1. This is what stops the route relaying arbitrary IPFS content - a path
  // segment that is not such a CID never reaches the gateway, whatever the gateway would have
  // served. It also makes traversal unreachable, since nothing but a re-serialised CID is used.
  let cid: CID;
  try {
    cid = CID.parse(requested);
  } catch {
    return new Response('not a CID', { status: 400, headers: cors });
  }
  if (cid.version !== 1 || cid.code !== 0x55) {
    return new Response('only raw-codec CIDv1 content is served', { status: 400, headers: cors });
  }

  const upstream = await fetch(`${gateway.replace(/\/$/, '')}/ipfs/${cid.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (upstream === null) {
    return new Response('the gateway could not be reached', { status: 502, headers: cors });
  }
  if (!upstream.ok) {
    // A private gateway answers 404 for anything it has not pinned, which is the honest answer
    // to give the client too: the content is not here.
    return new Response(null, { status: upstream.status === 404 ? 404 : 502, headers: cors });
  }

  const length = Number(upstream.headers.get('content-length') ?? NaN);
  if (Number.isFinite(length) && length > MAX_CONTENT_BYTES) {
    return new Response('content exceeds the single-block limit', { status: 502, headers: cors });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      'content-type': 'application/octet-stream',
      'cache-control': IMMUTABLE,
    },
  });
}
