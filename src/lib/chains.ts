/**
 * The chains this app can name, and how it describes one to a wallet.
 *
 * Chain definitions come from viem's own registry rather than a local table. The app used to
 * carry a three-entry `Record<number, string>` of names and build the rest of the chain with
 * `defineChain({ nativeCurrency: { symbol: 'ETH' } })`, which is right for every chain it had
 * been deployed on and wrong for the next one: **Gnosis pays gas in xDAI**, and an
 * `wallet_addEthereumChain` prompt that tells the wallet otherwise mislabels every fee the user
 * is shown from then on. Reading the definition instead of asserting it removes that whole class
 * of mistake - along with getting explorers, decimals and the canonical name for free.
 */
import { defineChain, type Chain } from 'viem';
import { anvil, base, baseSepolia, gnosis, gnosisChiado, mainnet, sepolia } from 'viem/chains';

/**
 * The chains the app is prepared to talk about. Named imports, not the whole `viem/chains`
 * barrel - importing the barrel would pull several hundred chain definitions into the bundle to
 * use six.
 *
 * Being here means only "the app can name this chain and describe it to a wallet". Which chains
 * it can actually *read and write* is a separate question, answered by whether a deployment is
 * configured for one.
 */
const KNOWN_CHAINS: readonly Chain[] = [mainnet, sepolia, base, baseSepolia, gnosis, gnosisChiado, anvil];

/**
 * The chain a mini-app host signs on. The Gnosis App's host is on Gnosis Chain and cannot be
 * moved, so the app reports that rather than leaving the connection's network unsaid - the SDK
 * carries no chain of its own to ask.
 */
export const HOST_CHAIN_ID = gnosis.id;

/** viem's definition for a chain id, or undefined when it is not one the app knows. */
export function knownChain(id: number): Chain | undefined {
  return KNOWN_CHAINS.find((chain) => chain.id === id);
}

/** A chain's name for display - falling back to the bare id, which is still better than nothing. */
export function chainName(id: number): string {
  return knownChain(id)?.name ?? `Chain ${id}`;
}

/**
 * Development chains, which viem does not flag as testnets because they are not public networks
 * at all. For the purpose the flag serves here - "is this real money?" - they belong with them.
 */
const LOCAL_CHAIN_IDS: ReadonlySet<number> = new Set([anvil.id]);

/** Whether a chain's tokens are play money: any testnet, plus the local development chains. */
export function isTestnet(id: number): boolean {
  return LOCAL_CHAIN_IDS.has(id) || knownChain(id)?.testnet === true;
}

/**
 * The chain to hand a wallet when asking it to switch to, or add, the deployment's network.
 *
 * A known chain is passed through **unmodified**, deliberately keeping viem's canonical public
 * RPC endpoints rather than substituting the app's own. The URL in an EIP-3085 `addChain` prompt
 * is the one the wallet keeps and uses afterwards, so pushing our endpoint there would both
 * outlive the visit and, the moment `VITE_RPC_URL` becomes a keyed provider rather than a public
 * one, hand that key to every wallet that accepts the prompt.
 *
 * Only an unknown chain - a local node, a network viem has no definition for - is synthesized
 * from the configured RPC, because there it is the only endpoint anyone has.
 */
export function deploymentChain(id: number, rpcUrl: string): Chain {
  return (
    knownChain(id) ??
    defineChain({
      id,
      name: chainName(id),
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    })
  );
}
