import type { NodeTally } from '../lib/impact';
import { axisPercent, figuresOf, formatImpact, readsDifferently } from '../lib/impact';
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
 *   own market's; the pale arc continuing clockwise is the rest of its sub-debate's. The thesis'
 *   is the whole circle: the debate's stake is what every other ring is a share of.
 *
 * The numbers are not gone, they are one hover away: every segment carries the figure it draws,
 * and only that - what a figure means is said once, on its term in the detail. That is the trade
 * this makes - a column of cards is scanned far more often than any one figure in it is read, and
 * shapes survive scanning where four percentages do not.
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
export const gaugeLabel = (rating: number, market?: number) => {
  const said = `Rating ${formatImpact(rating)}`;
  // The rating leads wherever the gauge speaks - it is the figure the bar is about. Where the
  // argument has a market of its own, the label ends by placing the rating against it: apart from
  // it when the two read differently, on it when they do not. "(= market)" rather than silence,
  // because an argument nobody has argued beneath still *has* a market, and a reader who has seen
  // the two-figure form elsewhere would otherwise be left wondering where the second one went.
  // The thesis passes none, and its label is the rating alone - it owns no market to be placed
  // against.
  if (market === undefined) return said;
  return readsDifferently(rating, market) ? `${said}, market ${formatImpact(market)}` : `${said} (= market)`;
};

export const ringLabel = (subtreeStake: number, total: number) =>
  `Staked ${formatVotes(subtreeStake)} of the debate's ${formatVotes(total)} vote tokens`;

/** Both of an argument's figures in words, for a control that wraps them. */
export const figuresLabel = (node: ArgumentNode, tally: NodeTally | undefined, total: number) => {
  const { market, rating, subtreeStake } = figuresOf(node, tally);
  return `${ringLabel(subtreeStake, total)}. ${gaugeLabel(rating, market)}`;
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
 * `gaugeSegments` decides the shape; the whole bar answers with one label.
 *
 * One label, not one per piece: the pieces are two ends of a single reading, and a hover that
 * answered "Market +84%" on the saturated run buried the very figure the gauge is about - the
 * reader is on the bar to learn the rating, whichever half the pointer happens to land on. The
 * pieces still mean what they draw; what they no longer do is each tell a different story.
 */
export function RatingGauge({
  rating,
  market,
  corrected,
  presentational,
}: {
  rating: number;
  /** The argument's own market price, where it has one. The thesis has none. */
  market?: number;
  /** Whether a sub-debate moved the rating off that price - what draws the correction run. */
  corrected?: boolean;
  /** Set where a surrounding control already names the figure, so it is not announced twice. */
  presentational?: boolean;
}) {
  // The market is the bar's base only where sub-arguments moved the rating off it. A settled leaf
  // whose time-weighted rating parts from the standing price gets no correction run - nothing was
  // argued beneath it to credit - but its label still names both figures.
  const segments = gaugeSegments(rating, corrected ? market : undefined);

  return (
    <span
      className="gauge"
      title={gaugeLabel(rating, market)}
      {...figureRole(presentational, () => gaugeLabel(rating, market))}
    >
      {segments.map(({ kind, side, style }, index) => (
        <span key={index} className={`gauge-${kind} ${side}`} style={style} />
      ))}
    </span>
  );
}

/** The ring's geometry, in the user units of its 18-unit box; the stroke is set in the stylesheet. */
const RING_RADIUS = 6.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** One drawn arc: how far round it runs, where it starts, and the figure it stands for. */
interface RingArc {
  cls: string;
  /** Arc length, in the circumference's own units. */
  length: number;
  /** Where the arc starts, measured the same way; arcs run clockwise from noon. */
  offset: number;
  title: string;
}

/** The ring itself: a hairline track and the arcs on it. Every ring on the page is drawn here. */
const Ring = ({
  arcs,
  label,
  presentational,
}: {
  arcs: RingArc[];
  label: () => string;
  presentational?: boolean;
}) => (
  <svg className="ring" viewBox="0 0 18 18" {...figureRole(presentational, label)}>
    <circle className="ring-track" cx="9" cy="9" r={RING_RADIUS} />
    {arcs.map(({ cls, length, offset, title }) => (
      <circle
        key={cls}
        className={cls}
        cx="9"
        cy="9"
        r={RING_RADIUS}
        strokeDasharray={`${length} ${RING_CIRCUMFERENCE}`}
        strokeDashoffset={-offset}
      >
        <title>{title}</title>
      </circle>
    ))}
  </svg>
);

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
  startsAt = 0,
  presentational,
}: {
  /** The argument's own market stake, in vote token units. */
  stake: number;
  /** That stake plus every sub-argument's. Equal to `stake` while the argument is undebated. */
  subtreeStake: number;
  /** Every stake the tally counts - what the two arcs are a share of. */
  total: number;
  /** The stake staked before this argument's slice (see `ringOffsetsOf`); noon without one. */
  startsAt?: number;
  /** Set where a surrounding control already names the figure, so it is not announced twice. */
  presentational?: boolean;
}) {
  if (total <= 0) {
    return null;
  }
  const arc = (units: number) => (units / total) * RING_CIRCUMFERENCE;
  const own = Math.max(stake, 0);
  const beneath = Math.max(subtreeStake - stake, 0);
  // The arcs run clockwise from the argument's own place on the debate's circle rather than from
  // noon, so the slices of the arguments on screen abut instead of overlapping: read together they
  // are one circle, cut where the stake is. The pale arc continues the dark one, because a branch
  // occupies a contiguous run (see `ringOffsetsOf`).
  //
  // Each names where its own end falls: the first the argument's own stake, the second the
  // branch's total - what a reader measures by following the ring, rather than the difference
  // between them, which is drawn nowhere. An undebated argument gets no second arc at all: a
  // zero-length one paints nothing but would still answer a hover, with a figure equal to the one
  // beside it.
  const arcs: RingArc[] = [
    {
      cls: 'ring-own',
      length: arc(own),
      offset: arc(startsAt),
      title: `Staked ${formatVotes(own)} ⬡ on its own market`,
    },
    ...(beneath > 0
      ? [
          {
            cls: 'ring-beneath',
            length: arc(beneath),
            offset: arc(startsAt + own),
            title: `Staked ${formatVotes(subtreeStake)} ⬡ with its sub-arguments`,
          },
        ]
      : []),
  ];

  return <Ring arcs={arcs} label={() => ringLabel(subtreeStake, total)} presentational={presentational} />;
}

/**
 * The debate's whole stake, which is what the thesis has: the full circle, because every other
 * ring on the page is a share of exactly this. Read as engagement rather than conviction - how
 * much the question drew, not which way it went - and the figure is on the ring, as on any other.
 */
export const DebateStakeRing = ({ total, presentational }: { total: number; presentational?: boolean }) => {
  if (total <= 0) {
    return null;
  }
  const said = `Staked ${formatVotes(total)} ⬡ across the whole debate`;
  return (
    <Ring
      arcs={[{ cls: 'ring-own', length: RING_CIRCUMFERENCE, offset: 0, title: said }]}
      label={() => said}
      presentational={presentational}
    />
  );
};

/**
 * An argument's pair of figures, wherever it appears. Both are read off the same node and tally,
 * so they are built once here rather than at each call site - a card and the focused claim were
 * deriving the same four values from the same two objects.
 */
export const ArgumentFigures = ({
  node,
  tally,
  total,
  startsAt,
  presentational,
}: {
  node: ArgumentNode;
  tally?: NodeTally;
  /** Every stake the tally counts - what the ring draws its share of. */
  total: number;
  /** Where this argument's slice of that circle begins (see `ringOffsetsOf`). */
  startsAt?: number;
  /** Set where a surrounding control names both figures itself (see `figuresLabel`). */
  presentational?: boolean;
}) => {
  const { market, rating, stake, subtreeStake, corrected } = figuresOf(node, tally);
  // One box around the pair, centred: the two are drawings of different heights, and a row that
  // aligns its items on text baselines has none to give them. The ring leads: how much is behind
  // an argument is what places it in the debate, and the gauge then says how it stands.
  return (
    <span className="figure-pair">
      <StakeRing
        stake={stake}
        subtreeStake={subtreeStake}
        total={total}
        startsAt={startsAt}
        presentational={presentational}
      />
      <RatingGauge rating={rating} market={market} corrected={corrected} presentational={presentational} />
    </span>
  );
};
