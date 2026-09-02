import type { Address } from 'viem';

import { chainName, isTestnet, knownChain } from '../lib/chains';

/**
 * The networks this app can be pointed at, and the slug each one goes by.
 *
 * The slug is load-bearing in two places: it is the URL segment that makes a shared link name the
 * network it was copied from, and it is the suffix on this network's environment variables. Both
 * are why the set is written here rather than derived - a slug that changed with a chain
 * definition would silently break every link that already contains it.
 */
const CHAIN_IDS: Readonly<Record<string, number>> = {
  mainnet: 1,
  sepolia: 11155111,
  base: 8453,
  'base-sepolia': 84532,
  gnosis: 100,
  chiado: 10200,
  anvil: 31337,
};

/**
 * What a read source or action layer needs to talk to a deployment: its endpoints, and nothing
 * about which network it is. Those layers work the same on every chain, so telling them the chain
 * would only give them something to branch on.
 */
export interface ContractConfig {
  address: Address;
  rpcUrl: string;
  /**
   * GraphQL endpoint of the debate indexer; debates load from it in one query, RPC as fallback.
   * Shared by every network, because one indexer covers them all and a query names its chain.
   */
  indexerUrl?: string;
}

/** A deployment: a contract config plus the identity the app routes and labels it by. */
export interface Deployment extends ContractConfig {
  /** URL segment and environment-variable suffix. Null for a build configured the legacy way. */
  slug: string | null;
  /** Null only in legacy single-network mode, where it is discovered from the RPC instead. */
  chainId: number | null;
  /**
   * The deployment's `CirclesIdentityRegistry` admitting any Circles human, offered as a preset gate
   * when creating a debate. Deployed beside the contract, so every deployment has one.
   */
  circlesRegistry: Address;
}

const env = import.meta.env as unknown as Record<string, string | undefined>;

/**
 * A network's own value for a variable - `VITE_DELIBERATE_ADDRESS_BASE_SEPOLIA` and friends.
 *
 * There is deliberately **no** fallback to the unsuffixed variable here. An address, an RPC and an
 * indexer are per-chain by definition, and inheriting them would give a network with none of its
 * own the *default network's contract*: the menu would offer Gnosis, the app would read Base
 * Sepolia's address on a Gnosis RPC, and every debate would simply be missing rather than say why.
 *
 * Vite emits `import.meta.env` as a whole object literal in the production bundle, not as
 * per-reference string substitution, so a computed key resolves at runtime exactly as it does in
 * dev. Verified against a production build rather than assumed - being wrong about it would have
 * failed only once deployed.
 */
function envFor(slug: string, base: string): string | undefined {
  return env[`${base}_${slug.toUpperCase().replace(/-/g, '_')}`] || undefined;
}

/**
 * Every deployment this build offers, in the order a network menu should list them.
 *
 * `VITE_CHAINS` is a comma-separated list of slugs. A build without it is in the single-network
 * mode the app shipped with: one unnamed deployment from the unsuffixed variables, no slug in its
 * URLs and no network menu. That mode is why `slug` and `chainId` are nullable - it is a migration
 * path, not a second architecture, and a build that names its chains never enters it.
 */
export function deployments(): Deployment[] {
  const slugs = (env.VITE_CHAINS ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0);

  if (slugs.length === 0) {
    const legacy = legacyDeployment();
    return legacy ? [legacy] : [];
  }

  return slugs.flatMap((slug) => {
    const chainId = CHAIN_IDS[slug];
    const address = envFor(slug, 'VITE_DELIBERATE_ADDRESS') as Address | undefined;
    // A named chain with no address is not an error to shout about: it is how a network is staged
    // - listed in VITE_CHAINS before its contract exists - and listing it in the menu would offer
    // a network that answers nothing.
    if (chainId === undefined || !address) {
      return [];
    }
    const rpcUrl = envFor(slug, 'VITE_RPC_URL') ?? knownChain(chainId)?.rpcUrls.default.http[0];
    const circlesRegistry = envFor(slug, 'VITE_CIRCLES_REGISTRY') as Address | undefined;
    if (!rpcUrl || !circlesRegistry) {
      return [];
    }
    return [
      {
        slug,
        chainId,
        address,
        rpcUrl,
        // One indexer for every network, reached through the same-origin proxy unless overridden.
        indexerUrl: env.VITE_INDEXER_URL || '/api/graphql',
        circlesRegistry,
      },
    ];
  });
}

function legacyDeployment(): Deployment | null {
  const address = env.VITE_DELIBERATE_ADDRESS as Address | undefined;
  const rpcUrl = env.VITE_RPC_URL;
  const circlesRegistry = env.VITE_CIRCLES_REGISTRY as Address | undefined;
  if (!address || !rpcUrl || !circlesRegistry) {
    return null;
  }
  return {
    slug: null,
    chainId: null,
    address,
    rpcUrl,
    indexerUrl: env.VITE_INDEXER_URL || undefined,
    circlesRegistry,
  };
}

/** How a deployment is named and grouped in the network menu. */
export function deploymentLabel(deployment: Deployment): string {
  return deployment.chainId === null ? 'Network' : chainName(deployment.chainId);
}

/** Whether a deployment's tokens are play money - the axis the menu's testnet toggle hides on. */
export function deploymentIsTestnet(deployment: Deployment): boolean {
  return deployment.chainId !== null && isTestnet(deployment.chainId);
}

/**
 * The deployment a route names. An unknown or absent slug falls back to the first configured
 * network, so a link from another build - or from before a network was retired - lands somewhere
 * real rather than on an error.
 */
export function deploymentFor(slug: string | null, available = deployments()): Deployment | null {
  return available.find((deployment) => deployment.slug === slug) ?? available[0] ?? null;
}
