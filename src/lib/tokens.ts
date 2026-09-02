import { erc20Abi, formatUnits, getAddress, parseUnits, type Address, type PublicClient } from 'viem';

/** An ERC-20's display identity: address, symbol, and decimals. */
export interface TokenInfo {
  /** The checksummed token address. */
  address: Address;
  symbol: string;
  decimals: number;
}

/**
 * The Gnosis Chain tokens offered as bounty presets: the wrapped gas token and Monerium's EURe.
 * The contract accepts any ERC-20 - these are just the one-click choices; the custom field takes
 * any address. Circles is not a preset yet: its tokens are ERC-1155 balances per avatar, and only
 * their ERC-20 wrappers could serve (see TODO.md).
 */
export const BOUNTY_TOKEN_PRESETS: readonly TokenInfo[] = [
  { address: getAddress('0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d'), symbol: 'WXDAI', decimals: 18 },
  { address: getAddress('0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430'), symbol: 'EURe', decimals: 18 },
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
