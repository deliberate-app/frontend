import { describe, expect, test } from 'bun:test';
import type { ArgumentNode, Debate, DebateTiming, Phase } from './types';
import { availablePhasePoke, finalizable } from './types';

const TIMING: DebateTiming = { editingEndTime: 700, ratingEndTime: 1000, chainTime: 0 };

function debate(phase: Phase, timing?: DebateTiming): Debate {
  return { id: 0, phase, nodes: [], timing };
}

function node(state: ArgumentNode['state'], finalizationTime: number): ArgumentNode {
  return {
    id: 1,
    parentId: 0,
    side: 'pro',
    text: '',
    approval: 0.5,
    weight: 0,
    state,
    finalizationTime,
  };
}

describe('availablePhasePoke', () => {
  test('offers the tally during the Tallying phase, even without timing data', () => {
    expect(availablePhasePoke(debate('tallying'))).toEqual({ kind: 'tally', target: 'finished' });
  });

  test('is closed while the phase clock has not run out', () => {
    expect(availablePhasePoke(debate('editing', { ...TIMING, chainTime: 700 }))).toBeNull();
    expect(availablePhasePoke(debate('rating', { ...TIMING, chainTime: 1000 }))).toBeNull();
  });

  test('offers the advance once the phase clock has run out', () => {
    expect(availablePhasePoke(debate('editing', { ...TIMING, chainTime: 701 }))).toEqual({
      kind: 'advance',
      target: 'rating',
    });
    expect(availablePhasePoke(debate('rating', { ...TIMING, chainTime: 1001 }))).toEqual({
      kind: 'advance',
      target: 'tallying',
    });
  });

  test('skips straight to Tallying when a debate slept through its Rating window', () => {
    expect(availablePhasePoke(debate('editing', { ...TIMING, chainTime: 1001 }))).toEqual({
      kind: 'advance',
      target: 'tallying',
    });
  });

  test('is closed on finished debates and on sample data without a chain', () => {
    expect(availablePhasePoke(debate('finished', { ...TIMING, chainTime: 9999 }))).toBeNull();
    expect(availablePhasePoke(debate('editing'))).toBeNull();
    expect(availablePhasePoke(debate('rating'))).toBeNull();
  });

  test('opens live on a ticking clock, keeping the load-time chain estimate as the floor', () => {
    const stale = debate('editing', { ...TIMING, chainTime: 600 });
    expect(availablePhasePoke(stale, 701)).toEqual({ kind: 'advance', target: 'rating' });
    // A clock behind the chain estimate (time-warped dev chain) never closes the gate again.
    expect(availablePhasePoke(debate('editing', { ...TIMING, chainTime: 701 }), 100)).toEqual({
      kind: 'advance',
      target: 'rating',
    });
  });
});

describe('finalizable', () => {
  const live = debate('editing', { ...TIMING, chainTime: 500 });

  test('opens for a created argument whose finalization time has passed', () => {
    expect(finalizable(node('created', 500), live)).toBe(true);
    expect(finalizable(node('created', 501), live)).toBe(false);
  });

  test('never opens for final arguments', () => {
    expect(finalizable(node('final', 0), live)).toBe(false);
  });

  test('never opens once the debate is finished - the tally has already run', () => {
    expect(finalizable(node('created', 0), debate('finished', { ...TIMING, chainTime: 9999 }))).toBe(false);
  });

  test('never opens on sample data without a chain', () => {
    expect(finalizable(node('created', 0), debate('editing'))).toBe(false);
  });

  test('opens live on a ticking clock, keeping the load-time chain estimate as the floor', () => {
    expect(finalizable(node('created', 501), live, 501)).toBe(true);
    expect(finalizable(node('created', 500), live, 100)).toBe(true);
  });
});
