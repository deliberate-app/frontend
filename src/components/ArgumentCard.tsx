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
  onFocus,
}: {
  debate: Debate;
  node: ArgumentNode;
  onFocus: (id: number) => void;
}) {
  const pros = childrenOf(debate, node.id, 'pro').length;
  const cons = childrenOf(debate, node.id, 'con').length;
  const replies = [
    pros > 0 ? `${pros} pro` : null,
    cons > 0 ? `${cons} con` : null,
  ].filter(Boolean);

  return (
    <button type="button" className={`card card-${node.side}`} onClick={() => onFocus(node.id)}>
      <span className="card-text">{node.text}</span>
      <span className="card-meta">
        <ApprovalGauge approval={node.approval} weight={node.weight} />
        {node.state === 'created' && (
          <span className="card-draft" title="Not final yet - still editable, not yet tradeable">
            draft
          </span>
        )}
        <span className="card-replies">
          {replies.length > 0 ? `${replies.join(' · ')} →` : 'No replies yet'}
        </span>
      </span>
    </button>
  );
}
