import { formatImpact } from '../lib/impact';
import { formatDuration } from '../lib/time';
import type { ArgumentNode, Debate } from '../types';
import { childrenOf } from '../types';

function ApprovalGauge({ approval, weight }: { approval: number; weight: number }) {
  const percent = Math.round(approval * 100);
  return (
    <span className="gauge">
      <span
        className="gauge-bar"
        role="img"
        aria-label={`Market approval ${percent} percent`}
      >
        <span className="gauge-pro" style={{ width: `${percent}%` }} />
      </span>
      <span className="gauge-figures">
        {percent}% · {weight} ⬡
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
  /** The argument's tally impact on its parent; absent while the debate is still being edited. */
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
      ? node.finalizationTime - Math.max(now, debate.timing.chainTime)
      : null;
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
            title="Impact on the parent argument"
          >
            {formatImpact(impact)}
          </span>
        )}
        {node.state === 'created' && (
          <span
            className="card-draft"
            title={
              finalizesIn !== null && finalizesIn <= 0
                ? 'Still editable, not yet tradeable - anyone may finalize it now'
                : 'Not final yet - still editable, not yet tradeable'
            }
          >
            {finalizesIn === null
              ? 'draft'
              : finalizesIn > 0
                ? `draft · ${formatDuration(finalizesIn)}`
                : 'draft · finalizable'}
          </span>
        )}
        <span className="card-replies">
          {replies.length > 0 ? `${replies.join(' · ')} →` : 'No replies yet'}
        </span>
      </span>
    </button>
  );
}
