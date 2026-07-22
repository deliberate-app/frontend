import { formatApproval } from '../lib/impact';
import { reservesOf, winnablePot } from '../lib/market';
import type { ArgumentNode } from '../types';

/**
 * The constant-product curve as a parametric plot (as in the whitepaper): con shares - the "bad
 * argument" axis - run right, pro shares - the "good argument" axis - run up, and the market sits
 * on the hyperbola `pro · con = k`. Staking slides the point along the curve: underrated stakes
 * toward the lower right (pro scarce, approval up), overrated toward the upper left.
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
        con shares · bad argument →
      </text>
      <text x={pad - 4} y={12} textAnchor="start" className="market-label market-label-pro">
        ↑ pro shares · good argument
      </text>
    </svg>
  );
}

/**
 * The focused argument's market, opened from the pot chip: the reserves on their constant-product
 * curve, the price they imply, and the pot a corrector can win per direction. Informational - the
 * cross and the backdrop are the exits.
 */
export function MarketDetail({
  node,
  feePercentage,
  onClose,
}: {
  node: ArgumentNode;
  /** The debate's market fee in percent, creator-chosen at creation. */
  feePercentage: number;
  onClose: () => void;
}) {
  const { pro, con } = reservesOf(node);
  const pot = winnablePot(node);

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

        <p className="market-readout">
          rated <strong className="mono">{formatApproval(node.approval)}</strong> · reserves{' '}
          <strong className="mono">
            {pro} <span className="market-pro">pro</span> / {con} <span className="market-con">con</span>
          </strong>{' '}
          · pool <strong className="mono">{node.weight} ⬡</strong>
          {feePercentage > 0 ? (
            <>
              {' '}
              · fee <strong className="mono">{feePercentage}%</strong>
            </>
          ) : (
            ' · no fee'
          )}
        </p>
        <p className="composer-hint">
          Staking slides the market along the curve and frees the bought side's reserve: correcting
          it wins up to <strong className="mono">{pot.underrated} ⬡</strong> if it proves underrated,
          up to <strong className="mono">{pot.overrated} ⬡</strong> if overrated (before fees).
        </p>
      </div>
    </div>
  );
}
