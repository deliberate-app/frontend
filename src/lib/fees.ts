/**
 * The market-fee creation setting: the percent of every stake accrued to the staked
 * argument's creator, chosen per debate by its creator (ADR-0010 in the contracts repo).
 */

/**
 * The default fee. Low on purpose: at 5% a lone corrector of a thin market lost tokens for
 * being right (the fee exceeded the curve gain); at 1% the same trade breaks even and profits.
 */
export const DEFAULT_FEE_PERCENT = 1;

/** Mirrors the contract's hard cap: at 100% a stake would degenerate into a pure fee transfer. */
export const MAX_FEE_PERCENT = 99;

/** The blocking validation mirroring the contract's `FeePercentageExceeded`; null when valid. */
export function feeError(feePercentage: number): string | null {
  if (!Number.isInteger(feePercentage) || feePercentage < 0 || feePercentage > MAX_FEE_PERCENT) {
    return `The fee must be a whole number between 0 and ${MAX_FEE_PERCENT}%.`;
  }
  return null;
}
