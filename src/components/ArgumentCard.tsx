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
  startsAt,
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
  /** Where this argument's slice of that circle begins (see `ringOffsetsOf`). */
  startsAt?: number;
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
  // A draft cannot be replied to (nesting needs a locked-in parent), so it gets no footer at all -
  // the countdown padlock in the head owns that story. Final and childless reads as an invitation.
  const beneath = replies.length > 0 ? `${replies.join(' · ')} →` : locked ? 'Undebated' : null;

  return (
    <button type="button" className={`card card-${node.side}`} onClick={() => onFocus(node.id)}>
      {/* The head reads left to right in the order it happened (principle 11): someone wrote the
          argument, its lock ran down, stake landed on it, and the rating followed. Above the claim
          rather than below it, so the eye meets who and how-much on the way in, and the row under
          the text is left as the way deeper. */}
      <span className="card-head">
        <Byline locked={locked} finalizesIn={finalizesIn} creator={node.creator} presentational />
        <ArgumentFigures node={node} tally={tally} total={totalStake} startsAt={startsAt} />
      </span>
      <span className="card-text">{node.text}</span>
      {beneath !== null && <span className="card-replies">{beneath}</span>}
    </button>
  );
}
