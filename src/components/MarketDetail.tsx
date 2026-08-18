import { useEffect, useState } from 'react';
import { formatApproval, MARKET_HINT } from '../lib/impact';
import { reservesOf } from '../lib/market';
import type { ArgumentNode } from '../types';

/**
 * The constant-product curve as a parametric plot (as in the whitepaper): bad-argument shares run
 * right, good-argument shares run up, and the market sits on the hyperbola `pro · con = k`.
 * Staking slides the point along the curve: underrated stakes toward the lower right (good-argument
 * shares scarce, approval up), overrated toward the upper left.
 */
function CurvePlot({ pro, con }: { pro: number; con: number }) {
  const k = pro * con;
  const max = Math.max(pro, con) * 1.35;
  const size = 260;
  const pad = 30;
  const sx = (x: number) => pad + (x / max) * (size - pad - 8);
  const sy = (y: number) => size - pad - (y / max) * (size - pad - 8);

  // Log-spaced samples keep the sharp corner of a one-sided market smooth.
  const steps = 72;
  const xMin = k / max;
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const x = xMin * Math.pow(max / xMin, i / steps);
    return `${i === 0 ? 'M' : 'L'} ${sx(x).toFixed(1)} ${sy(k / x).toFixed(1)}`;
  }).join(' ');

  return (
    <svg className="market-plot" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {/* Axes and the neutral 50% diagonal (pro = con). */}
      <line x1={pad} y1={size - pad} x2={size - 4} y2={size - pad} className="market-axis" />
      <line x1={pad} y1={size - pad} x2={pad} y2={4} className="market-axis" />
      <line x1={pad} y1={size - pad} x2={sx(max)} y2={sy(max)} className="market-diagonal" />
      <path d={path} className="market-curve" />
      <circle cx={sx(con)} cy={sy(pro)} r={4.5} className="market-point" />
      <text x={size - 4} y={size - pad + 16} textAnchor="end" className="market-label market-label-con">
        bad-argument shares →
      </text>
      <text x={pad - 4} y={12} textAnchor="start" className="market-label market-label-pro">
        ↑ good-argument shares
      </text>
    </svg>
  );
}

/**
 * The focused argument's market, opened from the rating market link: the reserves on their
 * constant-product curve, then the facts one under the other - price, stake, reserves, and the
 * fee with what it has earned the author so far - and, in words, what the reserves mean for a
 * corrector. Informational - the cross and the backdrop are the exits.
 */
export function MarketDetail({
  node,
  feePercentage,
  loadFeesEarned,
  onClose,
}: {
  node: ArgumentNode;
  /** The debate's market fee in percent, creator-chosen at creation. */
  feePercentage: number;
  /** The fees the argument has earned its author so far; absent for sample data without markets. */
  loadFeesEarned?: () => Promise<number>;
  onClose: () => void;
}) {
  const { pro, con } = reservesOf(node);

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
        aria-label="Rating market"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Rating market</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <CurvePlot pro={pro} con={con} />

        <dl className="market-facts">
          <dt title={MARKET_HINT}>Market</dt>
          <dd className="mono">{formatApproval(node.approval)}</dd>
          <dt>Staked</dt>
          <dd className="mono">{node.weight} ⬡</dd>
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
                <span className="mono">{feesEarned} ⬡</span> so far
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
