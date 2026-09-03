import type { NodeTally } from '../lib/impact';
import {
  axisPercent,
  figuresOf,
  formatImpact,
  MARKET_HINT,
  RATING_HINT,
  readsDifferently,
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
 * How a drawing announces itself: named where it stands alone, hidden where a control around it
 * already carries the words. Written once so the two figures cannot answer it differently - and the
 * label is only built when something will read it.
 */
const figureRole = (presentational: boolean | undefined, label: () => string) =>
  presentational ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': label() };

/**
 * What each figure says in words, so a control that wraps them can borrow it.
 *
 * A drawing inside a button is not reached on its own, so the button has to carry the figures in
 * its own name or they exist for the mouse alone. One source for both, or the two would drift.
 */
export const gaugeLabel = (rating: number, market?: number, thesis?: boolean) =>
  `${thesis ? 'Thesis rating' : 'Rating'} ${formatImpact(rating)}${
    market !== undefined && readsDifferently(rating, market) ? `, its own market ${formatImpact(market)}` : ''
  }`;

export const ringLabel = (subtreeStake: number, total: number) =>
  `${formatVotes(subtreeStake)} vote tokens staked here and beneath, of ${formatVotes(total)} the tally counts`;

/** Both of an argument's figures in words, for a control that wraps them. */
export const figuresLabel = (node: ArgumentNode, tally: NodeTally | undefined, total: number) => {
  const { market, rating, subtreeStake, corrected } = figuresOf(node, tally);
  return `${gaugeLabel(rating, corrected ? market : undefined)}. ${ringLabel(subtreeStake, total)}`;
};

/**
 * One fill on the axis: where it sits, and which of its two ends is an end.
 *
 * The corners carry meaning rather than style. A round cap says "this is where the bar stops"; a
 * square one says "this continues" - into the centre line it grows out of, or into the segment
 * beside it. So the reader can tell a bar that was cut short from one that simply ends there,
 * without reading a number.
 */
const cap = (round: boolean) => (round ? '999px' : '0');

const span = (from: number, to: number, roundFrom: boolean, roundTo: boolean) => {
  const a = axisPercent(from);
  const b = axisPercent(to);
  const [left, right] = a <= b ? [a, b] : [b, a];
  const [roundLeft, roundRight] = a <= b ? [roundFrom, roundTo] : [roundTo, roundFrom];
  return {
    left: `${left}%`,
    width: `${right - left}%`,
    borderRadius: `${cap(roundLeft)} ${cap(roundRight)} ${cap(roundRight)} ${cap(roundLeft)}`,
  };
};

/** Which side of neutral a figure landed on, as the class that colours it. Neutral takes neither. */
const sideOf = (value: number) => (value > 0 ? 'gauge-pro' : value < 0 ? 'gauge-con' : '');

/** One drawn piece of the bar: the market's own fill, or a run of the sub-debate's correction. */
export interface GaugeSegment {
  kind: 'fill' | 'correction';
  /** The side's class, or empty where the piece took no side. */
  side: string;
  style: { left: string; width: string; borderRadius: string };
}

/**
 * The bar, as the pieces it is drawn from.
 *
 * The fill runs from neutral to the market price. The correction runs from there to the rating and
 * is drawn over it, so a sub-debate that cut the price eats visibly into the bar rather than
 * sitting beside it. A run that carries the figure *away* from neutral put conviction on the side
 * it lands on and takes that side's pale hue; one that moves *toward* neutral only took conviction
 * away, and takes no side - it is grey. A correction crossing neutral does both, so it is two runs
 * meeting on the centre line, and painting it as one would claim the market's own stretch for a
 * side that never held it.
 *
 * Pass `market` only where a sub-debate moved the rating off it (see `figuresOf`). Without one the
 * bar is simply the rating, ending where it stops, and nothing is drawn that would credit a gap to
 * sub-arguments that do not exist.
 */
export function gaugeSegments(rating: number, market?: number): GaugeSegment[] {
  const correcting = market !== undefined && readsDifferently(rating, market);
  const base = correcting ? market : rating;
  const crossesNeutral = base !== 0 && rating !== 0 && Math.sign(rating) !== Math.sign(base);
  // The fill keeps its far cap unless the correction carries the bar past it, in which case that
  // run owns the end. Everything else about a corner is decided per run below.
  const extendsBar = !crossesNeutral && Math.abs(rating) > Math.abs(base);
  const fill: GaugeSegment = {
    kind: 'fill',
    side: sideOf(base),
    style: span(0, base, false, !extendsBar),
  };
  if (!correcting) {
    return [fill];
  }
  const stops = crossesNeutral ? [base, 0, rating] : [base, rating];
  return [
    fill,
    ...stops.slice(0, -1).map((from, index): GaugeSegment => {
      const to = stops[index + 1]!;
      const away = Math.abs(to) > Math.abs(from);
      return { kind: 'correction', side: away ? sideOf(to) : '', style: span(from, to, !away, away) };
    }),
  ];
}

/**
 * The rating on one signed axis: what the market priced, and what the sub-debate did to it.
 * `gaugeSegments` decides the shape; this draws it and says what each piece means.
 */
export function RatingGauge({
  rating,
  market,
  thesis,
  presentational,
}: {
  rating: number;
  /** The argument's own price, where a sub-debate moved the rating off it. */
  market?: number;
  /** The thesis owns no market of its own, so its bar is its rating and its label says so. */
  thesis?: boolean;
  /** Set where a surrounding control already names the figure, so it is not announced twice. */
  presentational?: boolean;
}) {
  const segments = gaugeSegments(rating, market);
  const correcting = segments.length > 1;
  const ratingTitle = `Rating ${formatImpact(rating)}`;

  return (
    <span className="gauge" {...figureRole(presentational, () => gaugeLabel(rating, market, thesis))}>
      {segments.map(({ kind, side, style }, index) => (
        <span
          key={index}
          className={`gauge-${kind} ${side}`}
          style={style}
          title={
            kind === 'correction'
              ? `${ratingTitle}, ${formatImpact(rating - (market as number))} off its own market price. ${RATING_HINT}`
              : thesis
                ? `Thesis rating ${formatImpact(rating)}. ${THESIS_RATING_HINT}`
                : correcting
                  ? `Market ${formatImpact(market as number)}. ${MARKET_HINT}`
                  : `${ratingTitle}. ${RATING_HINT}`
          }
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
  const arc = (units: number) => (units / total) * RING_CIRCUMFERENCE;
  const own = Math.max(stake, 0);
  const beneath = Math.max(subtreeStake - stake, 0);
  // Both arcs start at noon and run clockwise, the second offset by the length of the first. An
  // undebated argument gets no second arc at all: a zero-length one paints nothing but would still
  // answer a hover with "0 ⬡ staked on its sub-arguments", which describes nothing.
  const arcs = [
    { cls: 'ring-own', stake: own, offset: 0, of: "this argument's own market" },
    ...(beneath > 0
      ? [{ cls: 'ring-beneath', stake: beneath, offset: arc(own), of: 'its sub-arguments' }]
      : []),
  ];

  return (
    <svg
      className="ring"
      viewBox="0 0 18 18"
      {...figureRole(presentational, () => ringLabel(subtreeStake, total))}
    >
      <circle className="ring-track" cx="9" cy="9" r={RING_RADIUS} />
      {arcs.map(({ cls, stake: units, offset, of }) => (
        <circle
          key={cls}
          className={cls}
          cx="9"
          cy="9"
          r={RING_RADIUS}
          strokeDasharray={`${arc(units)} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={-offset}
        >
          <title>{`${formatVotes(units)} ⬡ staked on ${of}`}</title>
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
  const { market, rating, stake, subtreeStake, corrected } = figuresOf(node, tally);
  // One box around the pair, centred: the two are drawings of different heights, and a row that
  // aligns its items on text baselines has none to give them.
  return (
    <span className="figure-pair">
      <RatingGauge
        rating={rating}
        market={corrected ? market : undefined}
        presentational={presentational}
      />
      <StakeRing stake={stake} subtreeStake={subtreeStake} total={total} presentational={presentational} />
    </span>
  );
};
