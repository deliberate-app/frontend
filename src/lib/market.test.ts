import { describe, expect, test } from 'bun:test';
import type { ArgumentNode, Debate } from '../types';
import { tallyOf } from './impact';
import { previewStake, reservesOf, upsideOf, withMarkets, withPreviewedStake } from './market';

const node = (partial: Partial<ArgumentNode> & { id: number }): ArgumentNode => ({
  parentId: 0,
  side: 'pro',
  text: '',
  approval: 0.5,
  weight: 10,
  state: 'final',
  finalizationTime: 0,
  ...partial,
});

describe('reservesOf', () => {
  test('passes source-provided reserves through exactly', () => {
    expect(reservesOf(node({ id: 1, proReserve: 1, conReserve: 186 }))).toEqual({ pro: 1, con: 186 });
  });

  test('derives sample-data reserves from approval and weight', () => {
    // Bundled samples carry no reserves; approval x weight keeps their markets renderable.
    expect(reservesOf(node({ id: 1, approval: 0.8, weight: 100 }))).toEqual({ pro: 20, con: 80 });
  });
});

describe('upsideOf', () => {
  test('the upside per direction is the reserve a corrector can free', () => {
    // Production debate 4's argument ended at reserves (1, 186): nothing left to win by rating
    // it up further, 186 for whoever proves it overrated - matching the forensic replay, where
    // the lone-corrector's gain approached the 5-token seed reserve as the stake grew.
    expect(upsideOf(node({ id: 1, proReserve: 1, conReserve: 186 }))).toEqual({
      underrated: 1,
      overrated: 186,
    });
  });

  test('a fresh neutral seed offers its halves both ways', () => {
    expect(upsideOf(node({ id: 1, proReserve: 5, conReserve: 5 }))).toEqual({ underrated: 5, overrated: 5 });
  });
});

describe('previewStake', () => {
  // Every vector below is a trade the contract has actually executed, on anvil or on Base Sepolia.

  test('an overrated stake against an 80% seed: the action-layer end-to-end trade', () => {
    // Reserves 2 pro / 8 con, 20 tokens on con at a 5% fee: fee 1, net 19, con restored to
    // ceil(8 x 2 / 21) = 1, so 8 + 19 - 1 = 26 shares - and the price falls to 1/22.
    const preview = previewStake(node({ id: 1, proReserve: 2, conReserve: 8, weight: 10 }), 'con', 20, 5);
    expect(preview).toEqual({
      fee: 1,
      sharesOut: 26,
      reserves: { pro: 21, con: 1 },
      approval: 1 / 22,
      weight: 29,
    });
  });

  test('an overrated stake against an even seed', () => {
    // 5/5, 20 on con at 5%: net 19, con restored to ceil(25 / 24) = 2, 22 shares out.
    const preview = previewStake(node({ id: 1, proReserve: 5, conReserve: 5, weight: 10 }), 'con', 20, 5);
    expect(preview.sharesOut).toBe(22);
    expect(preview.reserves).toEqual({ pro: 24, con: 2 });
  });

  test('the showcase debate: three tokens against a 90% seed', () => {
    // Base Sepolia debate 1, argument 3: reserves 3/27, 3 tokens on con at 5% (fee rounds to 0),
    // con restored to ceil(27 x 3 / 6) = 14 - the market the detail shows as 6 good / 14 bad.
    const preview = previewStake(node({ id: 3, proReserve: 3, conReserve: 27, weight: 30 }), 'con', 3, 5);
    expect(preview).toEqual({
      fee: 0,
      sharesOut: 16,
      reserves: { pro: 6, con: 14 },
      approval: 14 / 20,
      weight: 33,
    });
  });

  test('the showcase debate: ten tokens for a 75% seed', () => {
    // Debate 1, argument 1: reserves 5/15, 10 on pro (fee 0), pro restored to ceil(75 / 25) = 3,
    // 12 shares out and the price rises to 25/28 - the +79% on the card.
    const preview = previewStake(node({ id: 1, proReserve: 5, conReserve: 15, weight: 20 }), 'pro', 10, 5);
    expect(preview.sharesOut).toBe(12);
    expect(preview.reserves).toEqual({ pro: 3, con: 25 });
    expect(preview.approval).toBeCloseTo(25 / 28, 12);
  });

  test('the fee rounds down, as the contract rounds it', () => {
    expect(previewStake(node({ id: 1, proReserve: 5, conReserve: 5 }), 'pro', 19, 5).fee).toBe(0);
    expect(previewStake(node({ id: 1, proReserve: 5, conReserve: 5 }), 'pro', 20, 5).fee).toBe(1);
    expect(previewStake(node({ id: 1, proReserve: 5, conReserve: 5 }), 'pro', 20, 0).fee).toBe(0);
  });

  test('a stake never drains the bought reserve and always frees at least its net amount', () => {
    for (const amount of [1, 2, 7, 50, 1_000, 100_000]) {
      const preview = previewStake(node({ id: 1, proReserve: 1, conReserve: 186 }), 'pro', amount, 1);
      expect(preview.reserves.pro).toBeGreaterThanOrEqual(1);
      expect(preview.sharesOut).toBeGreaterThanOrEqual(amount - preview.fee);
    }
  });
});

describe('withMarkets', () => {
  test('takes the fresh market columns and keeps everything else', () => {
    const thesis = node({ id: 0, parentId: null, side: null, weight: 0, text: 'thesis' });
    const argument = node({ id: 1, proReserve: 5, conReserve: 5, weight: 10, text: 'kept', creator: '0xabc' });
    const debate: Debate = { id: 0, phase: 'rating', feePercentage: 0, nodes: [thesis, argument] };

    const fresh = withMarkets(debate, [
      { id: 1, approval: 25 / 26, proReserve: 1, conReserve: 25, weight: 30, rating: null },
      // An argument the tree does not have yet is left for the next full load.
      { id: 7, approval: 0.5, proReserve: 5, conReserve: 5, weight: 10, rating: null },
    ]);

    expect(fresh.nodes).toHaveLength(2);
    expect(fresh.nodes[1]).toMatchObject({ text: 'kept', creator: '0xabc', approval: 25 / 26, weight: 30, proReserve: 1 });
    // A market the refetch does not mention stands as it was.
    expect(fresh.nodes[0]).toBe(thesis);
    expect(debate.nodes[1]).toBe(argument);
  });
});

describe('withPreviewedStake', () => {
  test('moves the one market and lets the mirror re-tally the tree around it', () => {
    const thesis = node({ id: 0, parentId: null, side: null, weight: 0 });
    const argument = node({ id: 1, proReserve: 5, conReserve: 5, weight: 10 });
    const debate: Debate = { id: 0, phase: 'rating', feePercentage: 0, nodes: [thesis, argument] };

    // 20 on pro, no fee: con takes 20 (25), pro is restored to ceil(25 / 25) = 1 - the price
    // goes from even to 25/26, and the argument's impact on the thesis from ±0 to +92%.
    const preview = previewStake(argument, 'pro', 20, 0);
    const previewed = withPreviewedStake(debate, 1, preview);

    expect(tallyOf(debate).get(1)?.impact).toBe(0);
    expect(tallyOf(previewed).get(1)?.impact).toBeCloseTo(2 * (25 / 26) - 1, 12);
    expect(previewed.nodes[1]).toMatchObject({ approval: 25 / 26, weight: 30, proReserve: 1, conReserve: 25 });
    // The input is left alone.
    expect(debate.nodes[1]).toBe(argument);
  });
});
