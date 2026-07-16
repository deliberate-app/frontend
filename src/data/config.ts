import type { Address } from 'viem';

export interface ContractConfig {
  address: Address;
  rpcUrl: string;
  /** Gateway to resolve argument content from (reads are digest-verified). */
  ipfsGateway?: string;
  /** kubo-compatible RPC API to publish argument content to when authoring. */
  ipfsApi?: string;
  /** GraphQL endpoint of the debate indexer; debates load from it in one query, with RPC as fallback. */
  indexerUrl?: string;
}

/** The on-chain deployment the app talks to; null when browsing the bundled sample debate. */
export function contractConfig(): ContractConfig | null {
  const address = import.meta.env.VITE_DELIBERATE_ADDRESS as Address | undefined;
  const rpcUrl = import.meta.env.VITE_RPC_URL as string | undefined;
  if (!address || !rpcUrl) {
    return null;
  }
  return {
    address,
    rpcUrl,
    ipfsGateway: (import.meta.env.VITE_IPFS_GATEWAY as string | undefined) || undefined,
    ipfsApi: (import.meta.env.VITE_IPFS_API as string | undefined) || undefined,
    indexerUrl: (import.meta.env.VITE_INDEXER_URL as string | undefined) || undefined,
  };
}
