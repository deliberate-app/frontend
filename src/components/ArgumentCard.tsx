import { formatApproval, formatImpact, IMPACT_HINT } from '../lib/impact';
import type { ArgumentNode, Debate } from '../types';
import { childrenOf, liveChainTime } from '../types';
import { LockChip } from './LockChip';

function ApprovalGauge({ approval, weight }: { approval: number; weight: number }) {
  // A diverging bar anchored at the neutral midpoint (50%): the fill grows right of centre for a backed
  // argument (green) and left of centre for a rejected one (red), matching the signed figure.
  const percent = Math.round(approval * 100);
  const positive = percent >= 50;
  return (
    <span className="gauge">
      <span className="gauge-bar" role="img" aria-label={`Market approval ${formatApproval(approval)}`}>
        <span
          className={`gauge-fill ${positive ? 'gauge-fill-pos' : 'gauge-fill-neg'}`}
          style={{ left: `${Math.min(percent, 50)}%`, width: `${Math.abs(percent - 50)}%` }}
        />
      </span>
      <span className="gauge-figures">
        {formatApproval(approval)} · {weight} ⬡
      </span>
    </span>
  );
}

export function ArgumentCard({
  debate,
  node,
  impact,
  now,
  onFocus,
}: {
  debate: Debate;
  node: ArgumentNode;
  /** The argument's sway on its parent: a live preview of the tally, its mirrored result once run. */
  impact?: number;
  /** The ticking clock (unix seconds), driving the draft finalization countdown. */
  now: number;
  onFocus: (id: number) => void;
}) {
  const pros = childrenOf(debate, node.id, 'pro').length;
  const cons = childrenOf(debate, node.id, 'con').length;

  // Time until the draft can be locked in; null without a chain clock (sample data).
  const finalizesIn =
    node.state === 'created' && debate.timing
      ? node.finalizationTime - liveChainTime(debate.timing, now)
      : null;
  // Final once the argument is locked in, or once the live clock has passed its finalization time.
  const locked = node.state === 'final' || (finalizesIn !== null && finalizesIn <= 0);
  const replies = [
    pros > 0 ? `${pros} pro` : null,
    cons > 0 ? `${cons} con` : null,
  ].filter(Boolean);

  return (
    <button type="button" className={`card card-${node.side}`} onClick={() => onFocus(node.id)}>
      <span className="card-text">{node.text}</span>
      <span className="card-meta">
        <ApprovalGauge approval={node.approval} weight={node.weight} />
        {impact !== undefined && (
          <span
            className={`card-impact ${impact > 0 ? 'impact-pos' : impact < 0 ? 'impact-neg' : ''}`}
            title={IMPACT_HINT}
          >
            {formatImpact(impact)}
          </span>
        )}
        <LockChip locked={locked} finalizesIn={finalizesIn} />
        <span className="card-replies">
          {replies.length > 0 ? `${replies.join(' · ')} →` : 'Undebated'}
        </span>
      </span>
    </button>
  );
}
