import type { NodeTally } from '../lib/impact';
import type { ArgumentNode, Debate } from '../types';
import { childrenOf, liveChainTime } from '../types';
import { Market, ParentImpact, Rating } from './Figures';
import { LockChip } from './LockChip';

export function ArgumentCard({
  debate,
  node,
  tally,
  now,
  onFocus,
}: {
  debate: Debate;
  node: ArgumentNode;
  /** The argument's rating and its impact on the parent: a live preview of the tally, its mirrored result once run. */
  tally?: NodeTally;
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
        <span className="card-figures">
          {/* Each figure carries the stake behind it: the market its own, the rating its whole
              sub-debate's - and the latter only once that sub-debate has added something, since
              until then it repeats the market's. */}
          <Market approval={node.approval} stake={node.weight} />
          {tally && (
            <Rating
              rating={tally.rating}
              stake={tally.subtreeWeight > node.weight ? tally.subtreeWeight : undefined}
            />
          )}
          {tally && <ParentImpact impact={tally.impact} />}
        </span>
        <LockChip locked={locked} finalizesIn={finalizesIn} />
        <span className="card-replies">
          {/* A draft cannot be replied to (nesting needs a locked-in parent), so its slot stays
              empty - the countdown padlock owns that story. Final and childless reads as an
              invitation. */}
          {replies.length > 0 ? `${replies.join(' · ')} →` : locked ? 'Undebated' : null}
        </span>
      </span>
    </button>
  );
}
