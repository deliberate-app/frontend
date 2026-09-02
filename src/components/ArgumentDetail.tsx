import { useEffect, useMemo, useState } from 'react';
import { ArgumentHistory } from './ArgumentHistory';
import { historyOf, type StakeEvent } from '../lib/history';
import {
  centered,
  formatApproval,
  formatImpact,
  IMPACT_HINT,
  MARKET_HINT,
  RATING_HINT,
  type NodeTally,
} from '../lib/impact';
import { formatVotes } from '../lib/votes';
import { reservesOf } from '../lib/market';
import type { ArgumentNode, Debate } from '../types';

/**
 * Everything about one argument, opened from its figures: how its rating and its stake got where
 * they are, then the facts one under the other - what it moves its parent by, its reserves, and
 * the fee with what it has earned the author so far - and, in words, what the reserves mean for a
 * corrector. Informational - the cross and the backdrop are the exits.
 *
 * The four figures the gauge and the ring draw as shapes are named in the chart's key, against the
 * line each belongs to, so they are not listed again here. Without a chart there is no key, and a
 * source that keeps no stake history - the bundled sample - falls back to stating them: this is
 * still the one place a reader who wants the numbers finds them.
 */
export function ArgumentDetail({
  debate,
  node,
  tally,
  stakes,
  feePercentage,
  loadFeesEarned,
  onClose,
}: {
  /** The whole debate: the chart replays this argument's figures against the rest of the tree. */
  debate: Debate;
  node: ArgumentNode;
  /** Every stake the debate has seen; empty from a source that keeps no history. */
  stakes: readonly StakeEvent[];
  /** The tally's verdict on this argument, and the stake behind it; absent for sample data. */
  tally?: NodeTally;
  /** The debate's market fee in percent, creator-chosen at creation. */
  feePercentage: number;
  /** The fees the argument has earned its author so far; absent for sample data without markets. */
  loadFeesEarned?: () => Promise<number>;
  onClose: () => void;
}) {
  const { pro, con } = reservesOf(node);
  const points = useMemo(() => historyOf(debate, stakes, node.id), [debate, stakes, node.id]);
  const totalDebateStake = useMemo(
    () => debate.nodes.reduce((sum, argument) => sum + argument.weight, 0),
    [debate],
  );

  const current = {
    market: centered(node.approval),
    rating: tally?.rating ?? centered(node.approval),
    stake: node.weight,
    subtreeStake: tally?.subtreeWeight ?? node.weight,
  };
  // The key states the figures, so the list below only does where the chart is absent.
  const charted = points.length >= 2 && totalDebateStake > 0;

  // Each correction is shown only where it says something the figure beside it does not: an
  // undebated argument's rating is its market price and its subtree is itself, and repeating a
  // number is how a fact list stops being read.
  const corrected = tally && formatImpact(tally.rating) !== formatApproval(node.approval);
  const deeper = tally && tally.subtreeWeight > node.weight;

  // The lifetime fee figure comes from the stake history, so it loads separately from the tree;
  // null while loading or when the source cannot say.
  const [feesEarned, setFeesEarned] = useState<number | null>(null);
  useEffect(() => {
    if (!loadFeesEarned || feePercentage === 0) return;
    let cancelled = false;
    loadFeesEarned()
      .then((fees) => {
        if (!cancelled) setFeesEarned(fees);
      })
      .catch(() => {
        if (!cancelled) setFeesEarned(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadFeesEarned, feePercentage]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Argument details"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Argument details</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ArgumentHistory points={points} totalDebateStake={totalDebateStake} current={current} />

        <dl className="detail-facts">
          {!charted && (
            <>
              <dt title={MARKET_HINT}>Market</dt>
              <dd className="mono">
                {formatApproval(node.approval)}
                {corrected && (
                  <span className="detail-corrected" title={RATING_HINT}>
                    · rated {formatImpact(tally.rating)}
                  </span>
                )}
              </dd>
              <dt>Staked</dt>
              <dd className="mono">
                {formatVotes(node.weight)} ⬡
                {deeper && (
                  <span
                    className="detail-corrected"
                    title="The stake the tally weighs this argument by: its own market's plus every sub-argument's."
                  >
                    · {formatVotes(tally.subtreeWeight)} ⬡ with its sub‑arguments
                  </span>
                )}
              </dd>
            </>
          )}
          {tally && (
            <>
              <dt title={IMPACT_HINT}>Parent impact</dt>
              <dd className="mono">{formatImpact(tally.impact)}</dd>
            </>
          )}
          <dt>Reserves</dt>
          <dd className="mono">
            {pro} <span className="market-pro">good</span> / {con} <span className="market-con">bad</span>
          </dd>
          <dt>Fee</dt>
          <dd>
            {feePercentage > 0 ? (
              <>
                <span className="mono">{feePercentage}%</span> of every stake, to the author
              </>
            ) : (
              'none'
            )}
          </dd>
          {feesEarned !== null && (
            <>
              <dt>Author earned</dt>
              <dd>
                <span className="mono">{formatVotes(feesEarned)} ⬡</span> so far
              </dd>
            </>
          )}
        </dl>
        <p className="composer-hint">
          Underrated stakes buy good-argument shares, paid by the argument's final rating; overrated
          stakes buy bad-argument shares, paid by its complement. Correcting the market can gain at
          most the reserve on that side, before fees.
        </p>
      </div>
    </div>
  );
}
