import type { NodeTally } from '../lib/impact';
import type { ArgumentNode, Debate } from '../types';
import { liveChainTime } from '../types';
import { Byline } from './Byline';
import { ArgumentFigures } from './Figures';
import { Replies } from './Replies';

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
  // Time until the draft can be locked in; null without a chain clock (sample data).
  const finalizesIn =
    node.state === 'created' && debate.timing
      ? node.finalizationTime - liveChainTime(debate.timing, now)
      : null;
  // Final once the argument is locked in, or once the live clock has passed its finalization time.
  const locked = node.state === 'final' || (finalizesIn !== null && finalizesIn <= 0);

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
      <Replies debate={debate} node={node} locked={locked} />
    </button>
  );
}
