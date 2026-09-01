/**
 * The single-network indexer proxy: `/api/graphql`, forwarding to `INDEXER_UPSTREAM_URL`.
 *
 * A build that names its chains in `VITE_CHAINS` calls the per-network route next door instead.
 */
import { proxyIndexer, upstreamVariable } from '../src/lib/indexerProxy';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const variable = upstreamVariable(null);
  return proxyIndexer(request, process.env[variable] ?? null, variable);
}
