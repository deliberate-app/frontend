import { describe, expect, test } from 'bun:test';
import type { Debate, DebateSummary, DebateTiming, Phase } from './types';
import { availablePhasePoke, editingOpen, filterDebates, livePhaseOf } from './types';

const TIMING: DebateTiming = { editingEndTime: 700, ratingEndTime: 1000, chainTime: 0, loadedAt: 0 };

function debate(phase: Phase, timing?: DebateTiming): Debate {
  return { id: 0, phase, feePercentage: 5, nodes: [], timing };
}

describe('availablePhasePoke', () => {
  test('offers the tally in the Tallying phase without timing data (a sample debate)', () => {
    expect(availablePhasePoke(debate('tallying'))).toEqual({ kind: 'tally', target: 'finished' });
  });

  test('is closed while the rating window has not run out', () => {
    expect(availablePhasePoke(debate('editing', { ...TIMING, chainTime: 700 }))).toBeNull();
    expect(availablePhasePoke(debate('rating', { ...TIMING, chainTime: 1000 }))).toBeNull();
  });

  test('opens the tally once the rating window has run out', () => {
    expect(availablePhasePoke(debate('rating', { ...TIMING, chainTime: 1001 }))).toEqual({
      kind: 'tally',
      target: 'finished',
    });
  });

  test('opens the tally even from a stale editing snapshot once rating time has passed', () => {
    // The earlier phases advance by the clock now, so a debate whose snapshot still reads editing but
    // whose clock is already past the rating window is tally-ready - no intermediate poke.
    expect(availablePhasePoke(debate('editing', { ...TIMING, chainTime: 1001 }))).toEqual({
      kind: 'tally',
      target: 'finished',
    });
  });

  test('is closed on finished debates and on sample data still in an earlier phase', () => {
    expect(availablePhasePoke(debate('finished', { ...TIMING, chainTime: 9999 }))).toBeNull();
    expect(availablePhasePoke(debate('editing'))).toBeNull();
    expect(availablePhasePoke(debate('rating'))).toBeNull();
  });

  test('opens live as the chain-time estimate advances between reloads', () => {
    // Loaded at wall 50 with the chain clock estimated at 900 (a time-warped dev chain ahead of the
    // wall): 101 s of wall time later the estimate passes the rating end (1000) and the tally opens.
    const stale = debate('rating', { ...TIMING, chainTime: 900, loadedAt: 50 });
    expect(availablePhasePoke(stale, 149)).toBeNull(); // 900 + 99 = 999
    expect(availablePhasePoke(stale, 151)).toEqual({ kind: 'tally', target: 'finished' }); // 900 + 101 = 1001
  });

  test('never closes again on a wall clock running behind the load-time estimate', () => {
    expect(
      availablePhasePoke(debate('rating', { ...TIMING, chainTime: 1001, loadedAt: 1000 }), 100),
    ).toEqual({ kind: 'tally', target: 'finished' });
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

describe('livePhaseOf', () => {
  test('keeps the stored phase on sample data without a chain clock', () => {
    expect(livePhaseOf(debate('editing'))).toBe('editing');
    expect(livePhaseOf(debate('rating'))).toBe('rating');
  });

  test('re-derives a stale snapshot from the clock, past both windows if need be', () => {
    expect(livePhaseOf(debate('editing', { ...TIMING, chainTime: 701 }))).toBe('rating');
    expect(livePhaseOf(debate('editing', { ...TIMING, chainTime: 1001 }))).toBe('tallying');
  });

  test('flips live as the chain-time estimate advances between polls', () => {
    const stale = debate('editing', { ...TIMING, chainTime: 690, loadedAt: 100 });
    expect(livePhaseOf(stale, 105)).toBe('editing'); // 690 + 5 = 695, within 700
    expect(livePhaseOf(stale, 111)).toBe('rating'); // 690 + 11 = 701, past 700
    expect(livePhaseOf(stale, 411)).toBe('tallying'); // 690 + 311 = 1001, past 1000
  });

  test('never finishes by the clock alone - the tally is a transaction', () => {
    expect(livePhaseOf(debate('rating', { ...TIMING, chainTime: 9999 }))).toBe('tallying');
  });

  test('finished is terminal, whatever the clock says', () => {
    expect(livePhaseOf(debate('finished', { ...TIMING, chainTime: 0 }), 0)).toBe('finished');
  });

  test('never regresses on a wall clock running behind the load-time estimate', () => {
    expect(livePhaseOf(debate('rating', { ...TIMING, chainTime: 701, loadedAt: 1000 }), 100)).toBe('rating');
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
  const all = { status: 'all' as const, thesis: '', author: '', sort: 'recent' as const };

  test('passes everything through unfiltered, newest first', () => {
    expect(filterDebates([summary(0), summary(2), summary(1)], all).map((d) => d.id)).toEqual([2, 1, 0]);
  });

  test('sorts by highest bounty in whole tokens, bounty-less debates last', () => {
    const bounty = (pool: bigint, decimals: number, symbol: string) => ({
      token: '0x0000000000000000000000000000000000000001',
      symbol,
      decimals,
      pool,
      claimed: 0n,
      swept: false,
      claimEndTime: 0,
    });
    const debates = [
      summary(0), // no bounty - sorts last
      summary(1, { bounty: bounty(500_000_000_000_000_000n, 18, 'WETH') }), // 0.5 in whole tokens
      summary(2, { bounty: bounty(50_000_000n, 6, 'USDC') }), // 50 in whole tokens
    ];
    // Unit-normalized, not value-normalized: 50 USDC ranks above 0.5 WETH without an oracle.
    expect(filterDebates(debates, { ...all, sort: 'bounty' }).map((d) => d.id)).toEqual([2, 1, 0]);
  });

  test('filters by thesis text, case-insensitively', () => {
    const debates = [summary(0, { thesis: 'Cities should release their transit data openly.' }), summary(1)];
    expect(filterDebates(debates, { ...all, thesis: 'TRANSIT data' }).map((d) => d.id)).toEqual([0]);
    expect(filterDebates(debates, { ...all, thesis: '  ' }).map((d) => d.id)).toEqual([1, 0]);
    expect(filterDebates(debates, { ...all, thesis: 'nowhere' })).toEqual([]);
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
    const result = filterDebates(debates, { status: 'rating', thesis: '', author: '0xf39', sort: 'stake' });
    expect(result.map((d) => d.id)).toEqual([1, 0]);
  });
});
