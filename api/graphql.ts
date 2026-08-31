/**
 * A same-origin proxy in front of the debate indexer (a Vercel edge function).
 *
 * The browser calls `/api/graphql` on the app's own origin, so the same-origin policy never
 * applies and no CORS header has to be present for the response to be readable. The hop to the
 * indexer happens server to server, where CORS is not a thing.
 *
 * This exists because of how the failure presented rather than what it was. The indexer answers
 * cross-origin correctly - it reflects the app's origin on both the preflight and the query -
 * but its responses carry `x-ratelimit-limit: 100, 100;w=60`, and a refused response does not
 * carry the CORS headers a successful one does. The browser reports any response missing
 * `Access-Control-Allow-Origin` as a CORS failure whatever its status was, so throttling
 * surfaced as a configuration error and sent the app into its chain fallback with nothing in
 * the console pointing at the real cause.
 *
 * Behind this proxy a throttled response arrives at the client as the 429 it always was, with
 * the rate-limit headers intact, so the next person to look sees the truth.
 *
 * Deliberately NOT cached. Collapsing repeat queries would cut the request volume, but the app
 * reads this endpoint for two things that must never be stale: `waitForIndexerBlock`, which
 * gates post-write freshness on the indexer having folded the very block just mined, and the
 * market poll that keeps an open stake modal honest. A cache short enough to be safe for those
 * would be too short to matter, and one long enough to matter would break them.
 */
import { corsFor } from '../src/lib/devCors';

export const config = { runtime: 'edge' };

/** Bounds what one request may forward; real GraphQL documents here are well under a kilobyte. */
const MAX_QUERY_BYTES = 16 * 1024;

/** Upstream rate-limit signals, passed through so throttling stays visible to the client. */
const FORWARDED_HEADERS = ['content-type', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];

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

  const upstream = process.env.INDEXER_UPSTREAM_URL;
  if (!upstream) {
    return new Response('the indexer proxy is not configured (INDEXER_UPSTREAM_URL is unset)', {
      status: 503,
      headers: cors,
    });
  }

  const body = await request.text();
  if (body.length > MAX_QUERY_BYTES) {
    return new Response(`query is ${body.length} bytes - at most ${MAX_QUERY_BYTES} are forwarded`, {
      status: 413,
      headers: cors,
    });
  }

  let response: Response;
  try {
    response = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch (error: unknown) {
    // The client already treats an unreachable indexer as a reason to read the chain instead;
    // 502 says the upstream failed rather than the proxy, which is the distinction worth keeping.
    return new Response(`the indexer could not be reached: ${String(error)}`, { status: 502, headers: cors });
  }

  const headers = new Headers(cors);
  for (const name of FORWARDED_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
