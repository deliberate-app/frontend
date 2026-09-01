import { formatApproval, formatImpact, IMPACT_HINT, MARKET_HINT, RATING_HINT } from '../lib/impact';
import { formatVotes } from '../lib/votes';

/**
 * The debate's figures, defined once and used wherever they appear - cards, the focused claim, the
 * ancestry rail, the stake preview. Every one of them lives on the same signed scale whose zero is
 * an undecided market (principle 8), so they read the same way and can be compared at a glance:
 *
 * - **Market** - what an argument's own market says, before its sub-arguments are counted.
 * - **Rating** - the debate's verdict on it: that market corrected by those sub-arguments. This is
 *   the figure its shares settle against, and the only one the thesis has (it owns no market).
 * - **Parent impact** - what its rating moves its parent's rating by, at its share of the stake.
 *
 * Market and Rating are shown as a pair, in that order: the market speaks first, the debate answers.
 * Where they agree the argument stands as its market priced it; where they part, the sub-debate (or,
 * after the tally, the time-weighting) is the difference.
 *
 * Each carries the stake behind it after a comma - the market its own, the rating its whole
 * sub-debate's - because a figure means little without knowing what backs it.
 */

const signClassOf = (value: number) => (value > 0 ? 'impact-pos' : value < 0 ? 'impact-neg' : '');

/** One labelled figure on the signed scale: name, the value in mono colored by its sign, and - when
 *  the figure is backed by a stake - that stake after a comma. */
export function SignedFigure({
  label,
  value,
  hint,
  stake,
  stakeHint,
  /** Renders the value without its label - for the compact rail, where the context is the row. */
  bare = false,
}: {
  label: string;
  value: number;
  hint: string;
  /** Vote tokens behind this figure; omitted where the stake would only repeat a neighbour's. */
  stake?: number;
  stakeHint?: string;
  bare?: boolean;
}) {
  return (
    <span className="figure" title={hint}>
      {!bare && <span className="figure-label">{label} </span>}
      <strong className={`mono ${signClassOf(value)}`}>{formatImpact(value)}</strong>
      {stake !== undefined && (
        <span className="figure-stake" title={stakeHint}>
          ,{' '}
          <span className="mono">{formatVotes(stake)}</span>
          <span className="unit">⬡</span>
        </span>
      )}
    </span>
  );
}

/** An argument's own market price, centered; takes the raw 0..1 approval the sources carry. */
export const Market = ({ approval, stake, bare }: { approval: number; stake?: number; bare?: boolean }) => (
  <SignedFigure
    label="Market"
    value={2 * approval - 1}
    hint={MARKET_HINT}
    stake={stake}
    stakeHint={stake === undefined ? undefined : `${formatVotes(stake)} ⬡ staked on this argument's own market`}
    bare={bare}
  />
);

/**
 * The debate's verdict on an argument - or, on the thesis, on the whole debate. Its stake is the
 * argument's whole subtree, which is what the tally weighs the blend by.
 */
export const Rating = ({
  rating,
  stake,
  hint = RATING_HINT,
  bare,
}: {
  rating: number;
  stake?: number;
  hint?: string;
  bare?: boolean;
}) => (
  <SignedFigure
    label="Rating"
    value={rating}
    hint={hint}
    stake={stake}
    stakeHint={stake === undefined ? undefined : `${formatVotes(stake)} ⬡ staked across this argument and its sub-arguments`}
    bare={bare}
  />
);

/** What an argument moves its parent's rating by. Carries no stake - its share of one is the figure. */
export const ParentImpact = ({ impact, bare }: { impact: number; bare?: boolean }) => (
  <SignedFigure label="Parent impact" value={impact} hint={IMPACT_HINT} bare={bare} />
);

export { formatApproval };
