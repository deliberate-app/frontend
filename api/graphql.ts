/**
 * The indexer proxy: `/api/graphql`, forwarding to `INDEXER_UPSTREAM_URL`.
 *
 * One route for every network the build offers. The indexer indexes each chain the contract is
 * deployed to and serves them from one endpoint, so what used to be a route per network is now a
 * `chainId` on the query.
 */
import { proxyIndexer, UPSTREAM_VARIABLE } from '../src/lib/indexerProxy';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  return proxyIndexer(request, process.env[UPSTREAM_VARIABLE] ?? null, UPSTREAM_VARIABLE);
}
