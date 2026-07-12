import { describe, expect, test } from 'bun:test';
import type { Debate, DebateSummary, DebateTiming, Phase } from './types';
import { availablePhasePoke, editingOpen, filterDebates } from './types';

const TIMING: DebateTiming = { editingEndTime: 700, ratingEndTime: 1000, chainTime: 0, loadedAt: 0 };

function debate(phase: Phase, timing?: DebateTiming): Debate {
  return { id: 0, phase, nodes: [], timing };
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

  test('opens live as the chain-time estimate advances between reloads', () => {
    // Loaded at wall 50 with the chain clock estimated at 600 (a time-warped
    // dev chain far ahead of the wall): 101 s of wall time later the gate opens.
    const stale = debate('editing', { ...TIMING, chainTime: 600, loadedAt: 50 });
    expect(availablePhasePoke(stale, 149)).toBeNull();
    expect(availablePhasePoke(stale, 151)).toEqual({ kind: 'advance', target: 'rating' });
  });

  test('never closes again on a wall clock running behind the load-time estimate', () => {
    expect(
      availablePhasePoke(debate('editing', { ...TIMING, chainTime: 701, loadedAt: 1000 }), 100),
    ).toEqual({ kind: 'advance', target: 'rating' });
  });
});

describe('editingOpen', () => {
  test('open while editing and the clock is within the window', () => {
    expect(editingOpen(debate('editing', { ...TIMING, chainTime: 700 }))).toBe(true);
  });

  test('closed once the editing window passes, even while still stored as editing', () => {
    expect(editingOpen(debate('editing', { ...TIMING, chainTime: 701 }))).toBe(false);
  });

  test('closed outside the editing phase', () => {
    expect(editingOpen(debate('rating', { ...TIMING, chainTime: 0 }))).toBe(false);
  });

  test('open on sample data without a chain clock', () => {
    expect(editingOpen(debate('editing'))).toBe(true);
  });

  test('closes live as the chain-time estimate advances between reloads', () => {
    const stale = debate('editing', { ...TIMING, chainTime: 690, loadedAt: 100 });
    expect(editingOpen(stale, 105)).toBe(true); // 690 + 5 = 695, within 700
    expect(editingOpen(stale, 111)).toBe(false); // 690 + 11 = 701, past 700
  });
});

describe('filterDebates', () => {
  const summary = (id: number, overrides: Partial<DebateSummary> = {}): DebateSummary => ({
    id,
    thesis: `Thesis ${id}`,
    phase: 'editing',
    stake: 0,
    argumentsCount: 1,
    creator: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    ...overrides,
  });
  const all = { status: 'all' as const, author: '', sort: 'recent' as const };

  test('passes everything through unfiltered, newest first', () => {
    expect(filterDebates([summary(0), summary(2), summary(1)], all).map((d) => d.id)).toEqual([2, 1, 0]);
  });

  test('filters by status', () => {
    const debates = [summary(0, { phase: 'rating' }), summary(1, { phase: 'finished' })];
    expect(filterDebates(debates, { ...all, status: 'rating' }).map((d) => d.id)).toEqual([0]);
  });

  test('sorts by stake, highest first, breaking ties by newest', () => {
    const debates = [
      summary(0, { stake: 50 }),
      summary(1, { stake: 5 }),
      summary(2, { stake: 50 }),
    ];
    expect(filterDebates(debates, { ...all, sort: 'stake' }).map((d) => d.id)).toEqual([2, 0, 1]);
  });

  test('filters by author, case-insensitively on any address fragment', () => {
    const debates = [
      summary(0, { creator: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }),
      summary(1, { creator: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }),
      summary(2, { creator: undefined }),
    ];
    expect(filterDebates(debates, { ...all, author: '0XF39FD' }).map((d) => d.id)).toEqual([0]);
    expect(filterDebates(debates, { ...all, author: 'dc79c8' }).map((d) => d.id)).toEqual([1]);
    expect(filterDebates(debates, { ...all, author: '  ' }).map((d) => d.id)).toEqual([2, 1, 0]);
  });

  test('combines status and author filters with the stake sort', () => {
    const debates = [
      summary(0, { phase: 'rating', stake: 40 }),
      summary(1, { phase: 'rating', stake: 100 }),
      summary(2, { phase: 'editing', stake: 100 }),
    ];
    const result = filterDebates(debates, { status: 'rating', author: '0xf39', sort: 'stake' });
    expect(result.map((d) => d.id)).toEqual([1, 0]);
  });
});
