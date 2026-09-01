import { describe, expect, test } from 'bun:test';

import { chainName, deploymentChain, isTestnet, knownChain } from './chains';

/**
 * What is worth testing here is not viem's chain table - that is theirs, and pinning its values
 * would only re-assert their data. It is the two decisions this module makes on top of it: which
 * chains count as play money, and what the app tells a wallet when it asks it to add a network.
 *
 * The second one is a regression test with a history. The app used to describe every chain to the
 * wallet as paying gas in ETH, which was true for Base and Base Sepolia and silently wrong for the
 * next chain on the list.
 */
describe('chain naming', () => {
  test('names the chains the app is deployed on', () => {
    expect(chainName(84532)).toBe('Base Sepolia');
    expect(chainName(8453)).toBe('Base');
    expect(chainName(100)).toBe('Gnosis');
    expect(chainName(10200)).toBe('Gnosis Chiado');
  });

  test('falls back to the bare id for a chain it does not know', () => {
    expect(knownChain(999_999)).toBeUndefined();
    expect(chainName(999_999)).toBe('Chain 999999');
  });
});

describe('testnet classification', () => {
  test('public testnets are testnets and their mainnets are not', () => {
    expect(isTestnet(84532)).toBe(true);
    expect(isTestnet(8453)).toBe(false);
    expect(isTestnet(10200)).toBe(true);
    expect(isTestnet(100)).toBe(false);
    expect(isTestnet(1)).toBe(false);
  });

  test('the local development chain counts as play money', () => {
    // viem does not flag anvil as a testnet - it is not a public network at all - but for the one
    // question this flag answers, "is this real money?", it belongs with them.
    expect(isTestnet(31337)).toBe(true);
  });

  test('an unknown chain is not assumed to be a testnet', () => {
    expect(isTestnet(999_999)).toBe(false);
  });
});

describe('describing a deployment to a wallet', () => {
  test('gnosis pays gas in xDAI, not ETH', () => {
    expect(deploymentChain(100, 'https://rpc.example/gnosis').nativeCurrency.symbol).toBe('XDAI');
    expect(deploymentChain(10200, 'https://rpc.example/chiado').nativeCurrency.symbol).toBe('xDAI');
  });

  test('keeps the canonical public RPC rather than handing the wallet ours', () => {
    // An EIP-3085 prompt's RPC URL is the one the wallet keeps and uses afterwards, so the app's
    // own endpoint must not travel in it - it would outlive the visit and, once VITE_RPC_URL is a
    // keyed provider, publish that key to every wallet that accepts.
    const chain = deploymentChain(84532, 'https://base-sepolia.example/with-a-key');
    expect(chain.rpcUrls.default.http).not.toContain('https://base-sepolia.example/with-a-key');
    expect(chain.id).toBe(84532);
    expect(chain.name).toBe('Base Sepolia');
  });

  test('synthesizes an unknown chain from the configured RPC, the only endpoint anyone has', () => {
    const chain = deploymentChain(31_338, 'http://127.0.0.1:9545');
    expect(chain.id).toBe(31_338);
    expect(chain.name).toBe('Chain 31338');
    expect(chain.rpcUrls.default.http).toEqual(['http://127.0.0.1:9545']);
  });
});
