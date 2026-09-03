import { useRef, useState } from 'react';
import type { HistoryPoint } from '../lib/history';
import { axisPercent, formatImpact } from '../lib/impact';
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
  /** The signed axis: +1 at the top, -1 at the bottom, 0 in the middle - the page's own scale. */
  const yRating = (value: number) => padTop + (1 - axisPercent(value) / 100) * plotHeight;
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

/** Which pair of series the reader is on: the two axes are read one at a time. */
type ReadGroup = 'ratings' | 'stakes';

export function ArgumentHistory({
  points,
  totalDebateStake,
  ratingWindow,
  thesis,
}: {
  points: readonly HistoryPoint[];
  /** The right axis' full scale: every stake in the debate. */
  totalDebateStake: number;
  /** The x-axis, end to end: when the rating phase opens and when it closes. */
  ratingWindow: { opens: number; closes: number };
  /**
   * The thesis owns no market and no stake of its own - its rating and its stake are its
   * sub-debate's, whole - so its chart is one line over one wash, and the pairs are singles.
   */
  thesis?: boolean;
}) {
  // What the reader is on, and where in the window. The pair is set by touching one of its series
  // and held until the pointer leaves the plot, so you can pick up the rating lines and then sweep
  // across the window reading them; the instant follows the pointer.
  const [group, setGroup] = useState<ReadGroup | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const plot = useRef<SVGSVGElement>(null);

  const { width, height, padLeft, padRight, padTop, padBottom } = HISTORY_BOX;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const drawable = points.length >= 2 && totalDebateStake > 0 && ratingWindow.closes > ratingWindow.opens;
  const { yRating, yStake, nowAt, rating, market, stake, subtree } = historyPlot(
    points,
    ratingWindow,
    totalDebateStake,
  );

  /** The pointer's position in the plot's own units, from wherever the figure has been scaled to. */
  const readAt = (event: { clientX: number }) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const units = ((event.clientX - box.left) / box.width) * width;
    setAt(Math.max(padLeft, Math.min(width - padRight, units)));
  };

  if (!drawable) {
    return null;
  }

  const floor = yStake(0);
  const last = points[points.length - 1]!;

  // The series hold their value between stakes, so the figure in force at an instant is the last
  // one that landed at or before it - and the point to mark sits under the pointer, not back at
  // the stake that set it.
  const time = at === null ? null : ratingWindow.opens + ((at - padLeft) / plotWidth) * (ratingWindow.closes - ratingWindow.opens);
  const held = time === null ? undefined : points.reduce((held, point) => (point.at <= time ? point : held), points[0]!);
  // Both of the pair's figures, whichever of its two series the reader picked up: on this plot one
  // is only meaningful against the other - a rating says little without the price it corrects, and
  // an argument's own stake little without its branch's.
  const row = (y: number, text: string) => ({ dot: y, y, text });
  const rows =
    group === null || held === undefined
      ? []
      : group === 'ratings'
        ? [
            row(yRating(held.rating), formatImpact(held.rating)),
            ...(thesis ? [] : [row(yRating(held.market), formatImpact(held.market))]),
          ]
        : [
            row(yStake(held.subtreeStake), `${formatVotes(held.subtreeStake)} ⬡`),
            ...(thesis ? [] : [row(yStake(held.stake), `${formatVotes(held.stake)} ⬡`)]),
          ];

  // Two figures a few pixels apart would overprint, so the closer pair is pushed to a legible gap
  // around where it sat. Only the writing moves - `dot` still marks the value itself.
  const [upper, lower] = [...rows].sort((a, b) => a.y - b.y);
  if (upper && lower) {
    const overlap = 9 - (lower.y - upper.y);
    if (overlap > 0) {
      upper.y -= overlap / 2;
      lower.y += overlap / 2;
    }
  }
  const reading = group !== null && at !== null && rows.length > 0 ? { at, rows } : null;
  const crowded = at !== null && at > width - padRight - 40;

  /** A pair steps forward by everything else stepping back; nothing changes size. */
  const groupClass = (own: ReadGroup) => `history-group ${group === own ? 'is-read' : ''}`;

  return (
    <figure className="history">
      <svg
        ref={plot}
        className={`history-plot ${group === null ? '' : 'is-reading'}`}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          thesis
            ? `Over the rating window the thesis' rating moved to ${formatImpact(last.rating)}, on ` +
              `${formatVotes(last.subtreeStake)} vote tokens.`
            : `Over the rating window this argument's market moved to ${formatImpact(last.market)} and the ` +
              `debate's verdict on it to ${formatImpact(last.rating)}, on ${formatVotes(last.subtreeStake)} ` +
              `vote tokens of the debate's ${formatVotes(totalDebateStake)}.`
        }
        onPointerMove={readAt}
        onPointerLeave={() => {
          setGroup(null);
          setAt(null);
        }}
      >
        <g className={groupClass('stakes')}>
          {/* The branch's stake, then the argument's own over it: what is left showing above the
              darker band is the sub-arguments' share. */}
          {/* The thesis' one wash takes the denser tone: it is the stake, not a share of it. */}
          <path
            className={`history-band ${thesis ? 'history-stake' : 'history-subtree'}`}
            d={area(subtree, floor)}
            onPointerEnter={() => setGroup('stakes')}
          />
          {!thesis && (
            <path
              className="history-band history-stake"
              d={area(stake, floor)}
              onPointerEnter={() => setGroup('stakes')}
            />
          )}
          <text className="history-tick" x={width - padRight + 4} y={yStake(totalDebateStake) + 3}>
            {formatVotes(totalDebateStake)}
          </text>
          <text className="history-tick" x={width - padRight + 4} y={yStake(0) + 3}>0</text>
        </g>

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

        <g className={groupClass('ratings')}>
          {!thesis && <path className="history-line history-market" d={path(market)} />}
          <path className="history-line history-rating" d={path(rating)} />
          <text className="history-tick" x={padLeft - 4} y={yRating(1) + 3} textAnchor="end">+100%</text>
          <text className="history-tick" x={padLeft - 4} y={yRating(0) + 3} textAnchor="end">±0%</text>
          <text className="history-tick" x={padLeft - 4} y={yRating(-1) + 3} textAnchor="end">−100%</text>
        </g>

        <text className="history-tick" x={padLeft} y={height - 6}>rating opens</text>
        <text className="history-tick" x={width - padRight} y={height - 6} textAnchor="end">closes</text>
        {/* Named only where the name fits between the two it sits between. */}
        {nowAt !== undefined && nowAt > padLeft + 30 && nowAt < width - padRight - 22 && (
          <text className="history-tick" x={nowAt} y={height - 6} textAnchor="middle">now</text>
        )}

        {/* A line is 1.6px of ink; this is the width that makes it something a pointer can find. */}
        {!thesis && <path className="history-hit" d={path(market)} onPointerEnter={() => setGroup('ratings')} />}
        <path className="history-hit" d={path(rating)} onPointerEnter={() => setGroup('ratings')} />

        {/* The reading, over everything and dimmed by nothing: where the pointer is in the window,
            what each of the pair's series stood at there, and the two figures themselves. */}
        {reading && (
          <g className={`history-reading history-reading-${group}`}>
            <line
              className="history-cursor"
              x1={reading.at}
              y1={padTop}
              x2={reading.at}
              y2={padTop + plotHeight}
            />
            {reading.rows.map(({ dot }, index) => (
              <circle key={index} className="history-dot" cx={reading.at} cy={dot} r="2" />
            ))}
            {reading.rows.map(({ y, text }, index) => (
              <text
                key={index}
                className="history-readout"
                // Written to whichever side of the cursor has room, so a reading near the close
                // does not run off the plot.
                x={reading.at + (crowded ? -5 : 5)}
                y={y + 2.5}
                textAnchor={crowded ? 'end' : 'start'}
              >
                {text}
              </text>
            ))}
          </g>
        )}
      </svg>
      <figcaption className="history-key">
        <span className={`history-key-item ${group === 'stakes' ? 'is-faded' : ''}`}>
          <span className="history-swatch history-rating" /> rating
        </span>
        {!thesis && (
          <span className={`history-key-item ${group === 'stakes' ? 'is-faded' : ''}`}>
            <span className="history-swatch history-market" /> its own market
          </span>
        )}
        {thesis ? (
          <span className={`history-key-item ${group === 'ratings' ? 'is-faded' : ''}`}>
            <span className="history-swatch history-swatch-area history-stake" /> staked
          </span>
        ) : (
          <>
            <span className={`history-key-item ${group === 'ratings' ? 'is-faded' : ''}`}>
              <span className="history-swatch history-swatch-area history-stake" /> its own stake
            </span>
            <span className={`history-key-item ${group === 'ratings' ? 'is-faded' : ''}`}>
              <span className="history-swatch history-swatch-area history-subtree" /> with sub‑arguments
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
