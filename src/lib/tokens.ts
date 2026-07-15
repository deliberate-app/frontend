import { erc20Abi, formatUnits, getAddress, parseUnits, type Address, type PublicClient } from 'viem';

/** An ERC-20's display identity: address, symbol, and decimals. */
export interface TokenInfo {
  /** The checksummed token address. */
  address: Address;
  symbol: string;
  decimals: number;
}

/**
 * The Base Sepolia tokens offered as bounty presets. The contract accepts any ERC-20 -
 * these are just the one-click choices; the custom field takes any address.
 */
export const BOUNTY_TOKEN_PRESETS: readonly TokenInfo[] = [
  { address: getAddress('0x4200000000000000000000000000000000000006'), symbol: 'WETH', decimals: 18 },
  { address: getAddress('0x036cbd53842c5426634e7929541ec2318f3dcf7e'), symbol: 'USDC', decimals: 6 },
  { address: getAddress('0x808456652fdb597867f38412077A9182bf77359F'), symbol: 'EURC', decimals: 6 },
];

/** Resolved token identities by lowercased address; presets are pre-seeded. */
const tokenCache = new Map<string, TokenInfo>(
  BOUNTY_TOKEN_PRESETS.map((token) => [token.address.toLowerCase(), token]),
);

/** The cached identity of a token, when it is a preset or was resolved before. */
export function knownToken(address: string): TokenInfo | undefined {
  return tokenCache.get(address.toLowerCase());
}

/**
 * Resolves an ERC-20's symbol and decimals - from the cache, or from the chain for
 * an unknown token. Throws when the address does not answer like an ERC-20.
 */
export async function tokenInfo(address: string, client: PublicClient): Promise<TokenInfo> {
  const cached = knownToken(address);
  if (cached) {
    return cached;
  }
  const checksummed = getAddress(address);
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: checksummed, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: checksummed, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  const info: TokenInfo = { address: checksummed, symbol, decimals };
  tokenCache.set(checksummed.toLowerCase(), info);
  return info;
}

/** Formats a raw token amount for display: "50 USDC", "0.5 WETH" - no trailing zeros. */
export function formatTokenAmount(amount: bigint, token: Pick<TokenInfo, 'symbol' | 'decimals'>): string {
  return `${formatUnits(amount, token.decimals)} ${token.symbol}`;
}

/** Parses a human amount ("0.5") into raw token units; throws on malformed input. */
export function parseTokenAmount(text: string, decimals: number): bigint {
  return parseUnits(text.trim(), decimals);
}
