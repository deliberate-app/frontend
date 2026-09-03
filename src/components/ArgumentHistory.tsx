import type { HistoryPoint } from '../lib/history';
import { formatImpact } from '../lib/impact';
import { formatVotes } from '../lib/votes';

/**
 * How an argument got where it is: two pairs of series over the rating window, on their own axes.
 *
 * The left axis is the signed scale every figure on the page uses, running the full ±100% whatever
 * the argument did, so two arguments' charts are read against the same ruler rather than each
 * against its own. The right axis is stake, from nothing to the whole debate's, for the same
 * reason: a branch holding a tenth of the debate should look like a tenth here too.
 *
 * The two pairs are drawn differently because they behave differently. A rating moves either way,
 * so it is a line. Stake only accumulates, and an argument's own stake is always part of its
 * branch's, so the pair is drawn as two stacked areas: the filled bottom band is what the argument
 * itself holds, the paler band above it is what its sub-arguments hold, and the two together are
 * the branch. That is the ring beside it, unrolled - same two greys, same order, same shares.
 *
 * Every series holds flat between stakes and steps where one landed. Nothing accrues in between,
 * and a sloped line across an hour when the jump took a block would draw movement that never
 * happened - most visibly once the shape beneath it is filled.
 *
 * The x-axis is the whole rating window, opening to close, whether or not anything has happened
 * across it. A window fitted to the stakes would scale itself per argument, so a flurry inside an
 * hour and a debate spread over a week would draw the same picture, and the empty stretch to the
 * right - the time still left to correct the argument - is a fact worth seeing. While the window
 * is open the series stop where the chain does, and a thin mark stands there; once it has closed
 * the series reach the right edge and there is nothing to mark.
 *
 * The key carries each series' figure as it stands now, which is why the argument has no separate
 * list of them: a number that names the line it belongs to says more than the same number in a
 * table. Those figures come from the tally rather than from the right edge of the plot, so a
 * settled argument shows what it settled at and not the projection the window closed on. All four
 * are always named, even where two coincide - an undebated argument reading the same stake twice
 * is the fact that nothing is staked beneath it, and a key that dropped rows would be read as a
 * different chart rather than as the same one with an empty band.
 */
/** The plot's box, in the user units its viewBox is drawn in. */
export const HISTORY_BOX = {
  width: 300,
  height: 132,
  padLeft: 34,
  padRight: 40,
  padTop: 10,
  padBottom: 20,
} as const;

/** One plotted coordinate, in those units. */
export type HistoryCoord = readonly [number, number];

/**
 * Where everything falls in the box: the three axis mappings, the four stepped series, and the
 * chain's clock. Separated from the drawing because this is the part with an answer that can be
 * checked - that the window is the phase's and not the stakes', that a series holds its value
 * until the stake that changed it, and that the clock is marked only while it is still inside the
 * window.
 */
export function historyPlot(
  points: readonly HistoryPoint[],
  ratingWindow: { opens: number; closes: number },
  totalDebateStake: number,
) {
  const { width, height, padLeft, padRight, padTop, padBottom } = HISTORY_BOX;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const span = ratingWindow.closes - ratingWindow.opens;

  /** The time axis: the rating phase end to end, whatever happened across it. */
  const x = (at: number) => padLeft + ((at - ratingWindow.opens) / span) * plotWidth;
  /** The signed axis: +1 at the top, -1 at the bottom, 0 in the middle. */
  const yRating = (value: number) => padTop + ((1 - Math.max(-1, Math.min(1, value))) / 2) * plotHeight;
  /** The stake axis: the debate's whole stake at the top, nothing at the bottom. */
  const yStake = (value: number) =>
    padTop + (1 - Math.max(0, Math.min(1, value / totalDebateStake))) * plotHeight;

  /** A series as the points it actually passes through: flat to the next stake, then a step at it. */
  const stepped = (pick: (point: HistoryPoint) => number, y: (value: number) => number) => {
    const coords: HistoryCoord[] = [];
    for (const point of points) {
      const at = x(point.at);
      const value = y(pick(point));
      const previous = coords[coords.length - 1];
      if (previous) {
        coords.push([at, previous[1]]);
      }
      coords.push([at, value]);
    }
    return coords;
  };

  const last = points[points.length - 1];
  return {
    x,
    yRating,
    yStake,
    /** Where the chain's clock stands; absent once the window has closed and nothing is left to mark. */
    nowAt: last && last.at < ratingWindow.closes ? x(last.at) : undefined,
    rating: stepped((point) => point.rating, yRating),
    market: stepped((point) => point.market, yRating),
    stake: stepped((point) => point.stake, yStake),
    subtree: stepped((point) => point.subtreeStake, yStake),
  };
}

const path = (coords: readonly HistoryCoord[]) =>
  coords.map(([cx, cy], i) => `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ');

/** The same outline, closed along the axis' zero so the area under it can be filled. */
const area = (coords: readonly HistoryCoord[], baseline: number) =>
  `${path(coords)} L${coords[coords.length - 1]![0].toFixed(1)},${baseline.toFixed(1)} ` +
  `L${coords[0]![0].toFixed(1)},${baseline.toFixed(1)} Z`;

export function ArgumentHistory({
  points,
  totalDebateStake,
  ratingWindow,
  current,
}: {
  points: readonly HistoryPoint[];
  /** The right axis' full scale: every stake in the debate. */
  totalDebateStake: number;
  /** The x-axis, end to end: when the rating phase opens and when it closes. */
  ratingWindow: { opens: number; closes: number };
  /** The four figures as they stand, for the key. Cumulative, as the axes read them. */
  current: { market: number; rating: number; stake: number; subtreeStake: number };
}) {
  if (points.length < 2 || totalDebateStake <= 0 || ratingWindow.closes <= ratingWindow.opens) {
    return null;
  }

  const { width, height, padLeft, padRight, padTop, padBottom } = HISTORY_BOX;
  const plotHeight = height - padTop - padBottom;
  const { yRating, yStake, nowAt, rating, market, stake, subtree } = historyPlot(
    points,
    ratingWindow,
    totalDebateStake,
  );

  const floor = yStake(0);
  const last = points[points.length - 1]!;

  return (
    <figure className="history">
      <svg
        className="history-plot"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          `Over the rating window this argument's market moved to ${formatImpact(last.market)} and the ` +
          `debate's verdict on it to ${formatImpact(last.rating)}, on ${formatVotes(last.subtreeStake)} ` +
          `vote tokens of the debate's ${formatVotes(totalDebateStake)}.`
        }
      >
        {/* The branch's stake, then the argument's own over it: what is left showing above the
            darker band is the sub-arguments' share. */}
        <path className="history-band history-subtree" d={area(subtree, floor)} />
        <path className="history-band history-stake" d={area(stake, floor)} />

        {/* Neutral, and the two axes it sits between - over the fill, which may reach past it. */}
        <line className="history-zero" x1={padLeft} y1={yRating(0)} x2={width - padRight} y2={yRating(0)} />
        <line className="history-axis" x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotHeight} />
        <line
          className="history-axis"
          x1={width - padRight}
          y1={padTop}
          x2={width - padRight}
          y2={padTop + plotHeight}
        />

        {nowAt !== undefined && (
          <line className="history-now" x1={nowAt} y1={padTop} x2={nowAt} y2={padTop + plotHeight} />
        )}

        <path className="history-line history-market" d={path(market)} />
        <path className="history-line history-rating" d={path(rating)} />

        <text className="history-tick" x={padLeft - 4} y={yRating(1) + 3} textAnchor="end">+100%</text>
        <text className="history-tick" x={padLeft - 4} y={yRating(0) + 3} textAnchor="end">±0%</text>
        <text className="history-tick" x={padLeft - 4} y={yRating(-1) + 3} textAnchor="end">−100%</text>
        <text className="history-tick" x={width - padRight + 4} y={yStake(totalDebateStake) + 3}>
          {formatVotes(totalDebateStake)}
        </text>
        <text className="history-tick" x={width - padRight + 4} y={yStake(0) + 3}>0</text>
        <text className="history-tick" x={padLeft} y={height - 6}>rating opens</text>
        <text className="history-tick" x={width - padRight} y={height - 6} textAnchor="end">closes</text>
        {/* Named only where the name fits between the two it sits between. */}
        {nowAt !== undefined && nowAt > padLeft + 30 && nowAt < width - padRight - 22 && (
          <text className="history-tick" x={nowAt} y={height - 6} textAnchor="middle">now</text>
        )}
      </svg>
      <figcaption className="history-key">
        <span className="history-key-item">
          <span className="history-swatch history-rating" /> rating
          <span className="history-key-value mono">{formatImpact(current.rating)}</span>
        </span>
        <span className="history-key-item">
          <span className="history-swatch history-market" /> its own market
          <span className="history-key-value mono">{formatImpact(current.market)}</span>
        </span>
        <span className="history-key-item">
          <span className="history-swatch history-swatch-area history-stake" /> its own stake
          <span className="history-key-value mono">{formatVotes(current.stake)} ⬡</span>
        </span>
        <span className="history-key-item">
          <span className="history-swatch history-swatch-area history-subtree" /> with sub‑arguments
          <span className="history-key-value mono">{formatVotes(current.subtreeStake)} ⬡</span>
        </span>
      </figcaption>
    </figure>
  );
}
