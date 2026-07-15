import { describe, expect, test } from 'bun:test';
import { BOUNTY_TOKEN_PRESETS, formatTokenAmount, knownToken, parseTokenAmount } from './tokens';

describe('formatTokenAmount', () => {
  const usdc = { symbol: 'USDC', decimals: 6 };
  const weth = { symbol: 'WETH', decimals: 18 };

  test('formats whole and fractional amounts without trailing zeros', () => {
    expect(formatTokenAmount(50_000_000n, usdc)).toBe('50 USDC');
    expect(formatTokenAmount(500_000_000_000_000_000n, weth)).toBe('0.5 WETH');
    expect(formatTokenAmount(0n, usdc)).toBe('0 USDC');
  });

  test('round-trips through parseTokenAmount', () => {
    expect(parseTokenAmount('50', 6)).toBe(50_000_000n);
    expect(parseTokenAmount('0.5', 18)).toBe(500_000_000_000_000_000n);
    expect(formatTokenAmount(parseTokenAmount('12.34', 6), usdc)).toBe('12.34 USDC');
  });

  test('rejects malformed amounts', () => {
    expect(() => parseTokenAmount('not a number', 6)).toThrow();
  });
});

describe('the preset cache', () => {
  test('knows the presets case-insensitively', () => {
    for (const preset of BOUNTY_TOKEN_PRESETS) {
      expect(knownToken(preset.address.toLowerCase())).toEqual(preset);
    }
    expect(knownToken('0x0000000000000000000000000000000000000001')).toBeUndefined();
  });
});
