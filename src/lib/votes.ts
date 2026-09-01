/**
 * Vote tokens on the wire versus on the screen.
 *
 * The contract holds a participant's budget in hundredths: one hundred tokens granted on joining, stored
 * as 10,000 units, so that whole-percent seedings and fees land exactly instead of rounding away. Every
 * amount that crosses the contract boundary - deposits, stakes, balances, payouts, fees - is in units.
 * Everything a person reads or types is in tokens, with two decimals. This module is the only place the
 * two meet, so the factor of a hundred is written once.
 */

/** Units per displayed token - the contract's `INITIAL_TOKENS` over the hundred-token budget it stands for. */
export const UNITS_PER_TOKEN = 100;

/** The budget granted on joining, in units - the contract's `Parameters.INITIAL_TOKENS`. */
export const INITIAL_UNITS = 10_000;

/** The smallest deposit an argument may be seeded with, in units - the contract's `_MIN_DEBATE_DEPOSIT`. */
export const MIN_DEPOSIT_UNITS = 1_000;

/** Units to a token string with two decimals, whole tokens shown bare: 1250 → "12.50", 10000 → "100". */
export function formatVotes(units: number): string {
  const tokens = units / UNITS_PER_TOKEN;
  return Number.isInteger(tokens) ? String(tokens) : tokens.toFixed(2);
}

/** Tokens to units, rounded to the nearest unit - the inverse of `formatVotes` for typed input. */
export function toUnits(tokens: number): number {
  return Math.round(tokens * UNITS_PER_TOKEN);
}

/** Units to tokens as a number, for input controls that bind to a token value. */
export function toTokens(units: number): number {
  return units / UNITS_PER_TOKEN;
}
