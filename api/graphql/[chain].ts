/**
 * The per-network indexer proxy: `/api/graphql/<network>`, forwarding to that network's own
 * indexer (`INDEXER_UPSTREAM_URL_GNOSIS`, `INDEXER_UPSTREAM_URL_BASE_SEPOLIA`, ...).
 *
 * The slug is validated against a charset rather than trusted, and there is deliberately **no**
 * fallback to the bare `INDEXER_UPSTREAM_URL`: a slug with no variable of its own must fail
 * loudly, because falling back would answer every mistyped or retired network with the default
 * network's data - the exact confusion putting the network in the URL was meant to end.
 */
import { proxyIndexer, upstreamVariable } from '../../src/lib/indexerProxy';

export const config = { runtime: 'edge' };

/** The shape a network slug may take; anything else never reaches an environment lookup. */
const SLUG = /^[a-z0-9-]{1,32}$/;

export default async function handler(request: Request): Promise<Response> {
  const slug = new URL(request.url).pathname.split('/').pop() ?? '';
  if (!SLUG.test(slug)) {
    return new Response('not a network', { status: 400 });
  }
  const variable = upstreamVariable(slug);
  return proxyIndexer(request, process.env[variable] ?? null, variable);
}
