import type { NodeTally } from '../lib/impact';
import type { ArgumentNode, Debate } from '../types';
import { childrenOf, liveChainTime } from '../types';
import { Byline } from './Byline';
import { ArgumentFigures } from './Figures';

export function ArgumentCard({
  debate,
  node,
  tally,
  now,
  totalStake,
  onFocus,
}: {
  debate: Debate;
  node: ArgumentNode;
  /** The argument's rating and its impact on the parent: a live preview of the tally, its mirrored result once run. */
  tally?: NodeTally;
  /** The ticking clock (unix seconds), driving the draft finalization countdown. */
  now: number;
  /** Every stake in the debate - what the card's ring draws its share of. */
  totalStake: number;
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
      {/* Whose claim this is and whether it can still change, before the claim itself - the same
          element in the same corner as on the focused claim. */}
      <span className="card-head">
        <Byline locked={locked} finalizesIn={finalizesIn} creator={node.creator} presentational />
      </span>
      <span className="card-text">{node.text}</span>
      <span className="card-meta">
        {/* The gauge answers "how does this stand", the ring "how much is behind it" - the two
            questions a column of cards is scanned for. The figures themselves are on hover. */}
        <ArgumentFigures node={node} tally={tally} total={totalStake} />
        <span className="card-replies">
          {/* A draft cannot be replied to (nesting needs a locked-in parent), so its slot stays
              empty - the padlock above owns that story. Final and childless reads as an invitation. */}
          {replies.length > 0 ? `${replies.join(' · ')} →` : locked ? 'Undebated' : null}
        </span>
      </span>
    </button>
  );
}
