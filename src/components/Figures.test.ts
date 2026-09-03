import { describe, expect, test } from 'bun:test';
import { gaugeLabel, gaugeSegments } from './Figures';

/** The corner convention, read back off a segment: which of its two ends is an end. */
const caps = (radius: string) => {
  const [topLeft, topRight] = radius.split(' ');
  return { left: topLeft !== '0', right: topRight !== '0' };
};

const at = (percent: string) => Number(percent.replace('%', ''));

describe('gaugeSegments', () => {
  test('draws an undebated argument as one bar that ends where it stops', () => {
    const [fill, ...rest] = gaugeSegments(0.2);
    expect(rest).toEqual([]);
    expect(fill!.kind).toBe('fill');
    expect(fill!.side).toBe('gauge-pro');
    // Square where it leaves the centre line, round where the bar ends.
    expect(caps(fill!.style.borderRadius)).toEqual({ left: false, right: true });
  });

  test('draws no correction for a gap too small to read', () => {
    // +69.4% and +69.2% both print as +69%, so there is nothing to draw and nothing to explain.
    expect(gaugeSegments(0.694, 0.692)).toHaveLength(1);
    // The bar is then the rating, not the market it rounds to.
    expect(at(gaugeSegments(0.694, 0.692)[0]!.style.width)).toBeCloseTo(34.7, 1);
  });

  test('gives the end to the correction where the sub-debate extended the bar', () => {
    const [fill, added, ...rest] = gaugeSegments(0.8, 0.4);
    expect(rest).toEqual([]);
    // The fill stops mid-bar, so its far corner stays square and the correction owns the end.
    expect(caps(fill!.style.borderRadius)).toEqual({ left: false, right: false });
    expect(added!.side).toBe('gauge-pro');
    expect(caps(added!.style.borderRadius)).toEqual({ left: false, right: true });
  });

  test('takes no side where the sub-debate only pulled the bar back toward neutral', () => {
    const [fill, eaten] = gaugeSegments(0.46, 0.84);
    // The bar still ends at the market price, so the fill keeps that cap and the correction
    // repeats it; the inner edge is square because the saturated fill continues from there.
    expect(caps(fill!.style.borderRadius)).toEqual({ left: false, right: true });
    expect(eaten!.side).toBe('');
    expect(caps(eaten!.style.borderRadius)).toEqual({ left: false, right: true });
  });

  test('splits a correction that crosses neutral, and rounds both outer ends', () => {
    const [, eaten, added] = gaugeSegments(-0.27, 0.41);
    // Everything from the market price back to neutral is conviction taken away: no side.
    expect(eaten!.side).toBe('');
    expect(at(eaten!.style.left)).toBeCloseTo(50, 5);
    expect(caps(eaten!.style.borderRadius)).toEqual({ left: false, right: true });
    // Only what lies beyond neutral landed on the other side.
    expect(added!.side).toBe('gauge-con');
    expect(at(added!.style.left) + at(added!.style.width)).toBeCloseTo(50, 5);
    expect(caps(added!.style.borderRadius)).toEqual({ left: true, right: false });
  });

  test('reads a con market from the centre leftwards', () => {
    const [fill] = gaugeSegments(-0.5);
    expect(fill!.side).toBe('gauge-con');
    expect(at(fill!.style.left)).toBeCloseTo(25, 5);
    expect(at(fill!.style.width)).toBeCloseTo(25, 5);
    // Round at the bar's own end, which is its left one here.
    expect(caps(fill!.style.borderRadius)).toEqual({ left: true, right: false });
  });

  test('gives a neutral market no side and a rating that leaves it the end', () => {
    const [fill, added] = gaugeSegments(0.3, 0);
    expect(fill!.side).toBe('');
    expect(at(fill!.style.width)).toBe(0);
    expect(added!.side).toBe('gauge-pro');
    expect(caps(added!.style.borderRadius)).toEqual({ left: false, right: true });
  });

  test('eats the whole bar where the sub-debate landed on neutral', () => {
    const [fill, eaten] = gaugeSegments(0, 0.4);
    expect(eaten!.side).toBe('');
    expect(eaten!.style).toEqual(fill!.style);
  });
});

describe('gaugeLabel', () => {
  test('the rating leads, and the market follows where it reads differently', () => {
    expect(gaugeLabel(0.46, 0.84)).toBe('Rating +46%, market +84%');
  });

  test('an argument nobody argued beneath says its rating is its market', () => {
    expect(gaugeLabel(0.46, 0.46)).toBe('Rating +46% (= market)');
  });

  test('figures too close to read apart count as equal, as the bar draws them', () => {
    expect(gaugeLabel(0.4601, 0.46)).toBe('Rating +46% (= market)');
  });

  test('the thesis owns no market, so its label is the rating alone', () => {
    expect(gaugeLabel(0.16)).toBe('Rating +16%');
  });
});
