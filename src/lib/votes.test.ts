import { describe, expect, test } from 'bun:test';

import { formatVotes, INITIAL_UNITS, MIN_DEPOSIT_UNITS, toTokens, toUnits, UNITS_PER_TOKEN } from './votes';

describe('vote token display', () => {
  test('a whole number of tokens shows bare, a fraction shows two decimals', () => {
    expect(formatVotes(INITIAL_UNITS)).toBe('100');
    expect(formatVotes(MIN_DEPOSIT_UNITS)).toBe('10');
    expect(formatVotes(1250)).toBe('12.50');
    expect(formatVotes(1)).toBe('0.01');
    expect(formatVotes(0)).toBe('0');
  });

  test('the budget and the minimum deposit keep their old faces', () => {
    // The scale changed on the wire, not in what people see: still a hundred to spend, still ten to seed.
    expect(formatVotes(INITIAL_UNITS)).toBe('100');
    expect(formatVotes(MIN_DEPOSIT_UNITS)).toBe('10');
    expect(INITIAL_UNITS / MIN_DEPOSIT_UNITS).toBe(10);
  });

  test('typed tokens round-trip through units', () => {
    for (const tokens of [0, 0.01, 10, 12.5, 99.99, 100]) {
      expect(toTokens(toUnits(tokens))).toBe(tokens);
    }
    expect(toUnits(12.345)).toBe(1235);
    expect(UNITS_PER_TOKEN).toBe(100);
  });
});
