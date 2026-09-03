import { describe, expect, test } from 'bun:test';
import type { HistoryPoint } from '../lib/history';
import { HISTORY_BOX, historyPlot } from './ArgumentHistory';

const { padLeft, padRight, padTop, padBottom, width, height } = HISTORY_BOX;
const right = width - padRight;
const bottom = height - padBottom;
const middle = (padTop + bottom) / 2;

const opens = 1_000;
const closes = 2_000;
const ratingWindow = { opens, closes };

const at = (time: number, over: Partial<HistoryPoint> = {}): HistoryPoint => ({
  at: time,
  market: 0,
  rating: 0,
  stake: 0,
  subtreeStake: 0,
  ...over,
});

describe('historyPlot', () => {
  test('spans the whole rating window, not the stakes it holds', () => {
    // Both stakes land in the first tenth; the axis is still the phase, so they plot there.
    const plot = historyPlot([at(opens), at(1_050), at(1_100)], ratingWindow, 100);
    expect(plot.x(opens)).toBe(padLeft);
    expect(plot.x(closes)).toBe(right);
    expect(plot.x(1_500)).toBe((padLeft + right) / 2);
    expect(plot.rating[plot.rating.length - 1]![0]).toBeLessThan((padLeft + right) / 2);
  });

  test('marks the clock where the series stop short of the close', () => {
    const plot = historyPlot([at(opens), at(1_500)], ratingWindow, 100);
    expect(plot.nowAt).toBe((padLeft + right) / 2);
  });

  test('marks nothing once the window has closed', () => {
    expect(historyPlot([at(opens), at(closes)], ratingWindow, 100).nowAt).toBeUndefined();
  });

  test('holds a series flat until the stake that moved it', () => {
    const plot = historyPlot([at(opens, { rating: 0 }), at(1_500, { rating: 1 })], ratingWindow, 100);
    // Three coordinates for two points: the step is the middle one, at the new time and the old value.
    expect(plot.rating).toEqual([
      [padLeft, middle],
      [plot.x(1_500), middle],
      [plot.x(1_500), padTop],
    ]);
  });

  test('reads the signed axis from +1 at the top to -1 at the bottom', () => {
    const plot = historyPlot([at(opens), at(closes)], ratingWindow, 100);
    expect(plot.yRating(1)).toBe(padTop);
    expect(plot.yRating(0)).toBe(middle);
    expect(plot.yRating(-1)).toBe(bottom);
    // Beyond full conviction is not a place on the axis.
    expect(plot.yRating(4)).toBe(padTop);
  });

  test('reads the stake axis from the debate’s whole stake down to nothing', () => {
    const plot = historyPlot([at(opens), at(closes)], ratingWindow, 100);
    expect(plot.yStake(100)).toBe(padTop);
    expect(plot.yStake(0)).toBe(bottom);
    expect(plot.yStake(50)).toBe(middle);
  });
});
