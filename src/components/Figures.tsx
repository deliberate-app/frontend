import type { NodeTally } from '../lib/impact';
import {
  axisPercent,
  centered,
  formatImpact,
  IMPACT_HINT,
  MARKET_HINT,
  RATING_HINT,
  signClassOf,
  THESIS_RATING_HINT,
} from '../lib/impact';
import { formatVotes } from '../lib/votes';
import type { ArgumentNode } from '../types';

/**
 * The debate's figures, defined once and used wherever they appear - cards and the focused claim.
 * Everything here lives on the same signed scale whose zero is an undecided market (principle 8),
 * so the shapes can be compared at a glance across a column without reading a single number:
 *
 * - **Rating gauge** - one axis carrying both halves of the story. The saturated fill is what the
 *   argument's own market says; the pale fill beyond or over it is what its sub-arguments did to
 *   that price. Green where they raised it, rust where they cut it - direction, not stance, since
 *   an argument's own stance is already the card's colour.
 * - **Stake ring** - how much of the debate's stake sits under this argument. The dark arc is its
 *   own market's; the pale arc continuing clockwise is the rest of its sub-debate's.
 *
 * The numbers are not gone, they are one hover away: every segment carries the figure it draws.
 * That is the trade this makes - a column of cards is scanned far more often than any one figure
 * in it is read, and shapes survive scanning where four percentages do not.
 */

/**
 * What each figure says in words, so a control that wraps them can borrow it.
 *
 * A drawing inside a button is not reached on its own, so the button has to carry the figures in
 * its own name or they exist for the mouse alone. One source for both, or the two would drift.
 */
export const gaugeLabel = (rating: number, market?: number) =>
  `${market === undefined ? 'Thesis rating' : 'Rating'} ${formatImpact(rating)}${
    market !== undefined && formatImpact(rating) !== formatImpact(market)
      ? `, its own market ${formatImpact(market)}`
      : ''
  }`;

export const ringLabel = (subtreeStake: number, total: number) =>
  `${formatVotes(subtreeStake)} vote tokens staked here and beneath, of ${formatVotes(total)} the tally counts`;

/** Both of an argument's figures in words, for a control that wraps them. */
export const figuresLabel = (node: ArgumentNode, tally: NodeTally | undefined, total: number) => {
  const market = centered(node.approval);
  return `${gaugeLabel(tally?.rating ?? market, market)}. ${ringLabel(tally?.subtreeWeight ?? node.weight, total)}`;
};

/** The extent of one fill on the axis, as the inline position it is drawn at. */
/**
 * One fill on the axis: where it sits, and which of its two ends is an end.
 *
 * The corners carry meaning rather than style. A round cap says "this is where the bar stops"; a
 * square one says "this continues" - into the centre line it grows out of, or into the segment
 * beside it. So the reader can tell a bar that was cut short from one that simply ends there,
 * without reading a number.
 */
const span = (from: number, to: number, roundFrom: boolean, roundTo: boolean) => {
  const a = axisPercent(from);
  const b = axisPercent(to);
  const [left, right] = a <= b ? [a, b] : [b, a];
  const [roundLeft, roundRight] = a <= b ? [roundFrom, roundTo] : [roundTo, roundFrom];
  const cap = (round: boolean) => (round ? '999px' : '0');
  return {
    left: `${left}%`,
    width: `${right - left}%`,
    borderRadius: `${cap(roundLeft)} ${cap(roundRight)} ${cap(roundRight)} ${cap(roundLeft)}`,
  };
};

/**
 * The rating on one signed axis: what the market priced, and what the sub-debate did to it.
 *
 * The saturated bar runs from the centre to `market`, coloured by which side of neutral it lands.
 * The correction runs from there to `rating` and is drawn over it, so a sub-debate that cut the
 * price eats visibly into the bar rather than sitting beside it. Where the sub-debate added to the
 * bar - carrying the argument further from neutral - the correction takes the pale hue of the side
 * it added on; where it only pulled the argument back toward neutral it is grey. A correction that
 * crosses neutral does both, and is drawn as both. Omit `market` for the thesis, which owns no
 * market of its own: the bar is then simply its rating, and the tooltip says so.
 */
export function RatingGauge({
  rating,
  market,
  presentational,
}: {
  rating: number;
  market?: number;
  /** Set where a surrounding control already names the figure, so it is not announced twice. */
  presentational?: boolean;
}) {
  const base = market ?? rating;
  const thesis = market === undefined;
  // Whether the correction is worth drawing is whether it is worth reporting, so the question is
  // asked through the formatter that decides what "worth reporting" means.
  const correcting = !thesis && formatImpact(rating) !== formatImpact(base);

  // Which corners are ends depends on what the sub-debate did, which is not the same question as
  // which way it moved: on a con market a rating nearer neutral is "raised" and yet the bar is
  // shorter. What decides a corner is whether the correction reaches past the market price
  // (extending the bar), sits inside it (eating into it), or crosses neutral (replacing it).
  const sameSide = base === 0 || rating === 0 || Math.sign(rating) === Math.sign(base);
  const extendsBar = sameSide && Math.abs(rating) > Math.abs(base);
  // What decides the correction's colour is whether it adds to the bar or eats into it. A
  // sub-debate that carried the argument further from neutral put conviction on a side, and that
  // side's pale hue says which. One that only pulled the argument back toward neutral took
  // conviction away without putting any anywhere, so it is grey - the figure moved, nothing took a
  // side. A rating landing exactly on neutral has not crossed it, and neither has one correcting a
  // market that was already there.
  const crossesNeutral = base !== 0 && rating !== 0 && Math.sign(rating) !== Math.sign(base);
  const addsToBar = extendsBar || crossesNeutral;
  const addedTone = rating > 0 ? 'gauge-added-pro' : 'gauge-added-con';

  // A correction that crosses neutral is two facts, not one, so it is two spans. Everything from
  // the market price back to neutral is conviction taken away from the side the market had picked,
  // which is grey by the rule above; only what lies beyond neutral was put on the other side.
  // Painting the crossing in one pale hue would claim the market's own stretch for a side that
  // never held it. The join sits on neutral, where the zero mark stands, so the two square edges
  // that meet there are the ones already covered.
  const corrections = !correcting
    ? []
    : crossesNeutral
      ? [
          { tone: 'gauge-eaten', style: span(base, 0, true, false) },
          { tone: addedTone, style: span(0, rating, false, true) },
        ]
      : [
          {
            tone: addsToBar ? addedTone : 'gauge-eaten',
            // Square where it meets the market's fill, round where the bar actually stops.
            style: span(base, rating, !extendsBar, extendsBar),
          },
        ];

  return (
    <span className="gauge" {...(presentational ? { 'aria-hidden': true } : { role: 'img', 'aria-label': gaugeLabel(rating, market) })}>
      <span
        className={`gauge-fill ${base > 0 ? 'gauge-pro' : base < 0 ? 'gauge-con' : ''}`}
        // Square where it leaves the centre line; round at the far end unless the correction
        // carries the bar further, in which case that segment owns the end.
        style={span(0, base, false, !extendsBar)}
        title={
          thesis
            ? `Thesis rating ${formatImpact(rating)}. ${THESIS_RATING_HINT}`
            : `Market ${formatImpact(base)}. ${MARKET_HINT}`
        }
      />
      {corrections.map(({ tone, style }) => (
        <span
          key={tone}
          className={`gauge-correction ${tone}`}
          style={style}
          title={`Rating ${formatImpact(rating)}, ${formatImpact(rating - base)} off its own market price. ${RATING_HINT}`}
        />
      ))}
    </span>
  );
}

/** The ring's geometry, in the user units of its 18-unit box; the stroke is set in the stylesheet. */
const RING_RADIUS = 6.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * How much of the debate's stake sits under one argument, as a ring read clockwise from noon.
 *
 * The dark arc is the argument's own market stake and the pale arc continuing it is the rest of
 * its sub-debate's, so the two together are the weight the tally gives this branch and the gap
 * back to noon is everything else in the debate. A ring rather than a number because the figure
 * that matters is a share, and a share is a shape.
 */
export function StakeRing({
  stake,
  subtreeStake,
  total,
  presentational,
}: {
  /** The argument's own market stake, in vote token units. */
  stake: number;
  /** That stake plus every sub-argument's. Equal to `stake` while the argument is undebated. */
  subtreeStake: number;
  /** Every stake the tally counts - what the two arcs are a share of. */
  total: number;
  /** Set where a surrounding control already names the figure, so it is not announced twice. */
  presentational?: boolean;
}) {
  if (total <= 0) {
    return null;
  }
  const arc = (units: number) => (Math.max(units, 0) / total) * RING_CIRCUMFERENCE;
  const own = arc(stake);
  // Both arcs start at noon and run clockwise, the second offset by the length of the first. A
  // zero-length arc paints nothing under a butt linecap, so an undebated argument needs no guard.
  const arcs = [
    { key: 'ring-own', length: own, offset: 0, stake, of: "this argument's own market" },
    { key: 'ring-beneath', length: arc(subtreeStake - stake), offset: own, stake: subtreeStake - stake, of: 'its sub-arguments' },
  ];

  return (
    <svg
      className="ring"
      viewBox="0 0 18 18"
      {...(presentational ? { 'aria-hidden': true } : { role: 'img', 'aria-label': ringLabel(subtreeStake, total) })}
    >
      <circle className="ring-track" cx="9" cy="9" r={RING_RADIUS} />
      {arcs.map(({ key, length, offset, stake: units, of }) => (
        <circle
          key={key}
          className={key}
          cx="9"
          cy="9"
          r={RING_RADIUS}
          strokeDasharray={`${length} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={-offset}
        >
          <title>{`${formatVotes(Math.max(units, 0))} ⬡ staked on ${of}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/**
 * The debate's whole stake, which is what the thesis has instead of a ring: a share of itself
 * would always be the full circle. Read as engagement rather than conviction - how much the
 * question drew, not which way it went.
 */
export const TotalStake = ({ total }: { total: number }) => (
  <span className="figure" title="Vote tokens staked across the whole debate - how much it drew">
    <span className="figure-label">Stake </span>
    <strong className="mono">{formatVotes(total)}</strong>
    <span className="unit">⬡</span>
  </span>
);

/**
 * An argument's pair of figures, wherever it appears. Both are read off the same node and tally,
 * so they are built once here rather than at each call site - a card and the focused claim were
 * deriving the same four values from the same two objects.
 */
export const ArgumentFigures = ({
  node,
  tally,
  total,
  presentational,
}: {
  node: ArgumentNode;
  tally?: NodeTally;
  /** Every stake the tally counts - what the ring draws its share of. */
  total: number;
  /** Set where a surrounding control names both figures itself (see `figuresLabel`). */
  presentational?: boolean;
}) => {
  const market = centered(node.approval);
  // One box around the pair, centred: the two are drawings of different heights, and a row that
  // aligns its items on text baselines has none to give them.
  return (
    <span className="figure-pair">
      <RatingGauge rating={tally?.rating ?? market} market={market} presentational={presentational} />
      <StakeRing
        stake={node.weight}
        subtreeStake={tally?.subtreeWeight ?? node.weight}
        total={total}
        presentational={presentational}
      />
    </span>
  );
};

/** What an argument moves its parent's rating by. Carries no stake - its share of one is the figure. */
export const ParentImpact = ({ impact }: { impact: number }) => (
  <span className="figure" title={IMPACT_HINT}>
    <span className="figure-label">Parent impact </span>
    <strong className={`mono ${signClassOf(impact)}`}>{formatImpact(impact)}</strong>
  </span>
);
