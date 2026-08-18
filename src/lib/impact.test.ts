import { describe, expect, test } from 'bun:test';
import type { ArgumentNode, Debate } from '../types';
import { formatImpact, tallyOf } from './impact';

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

const thesis = node({ id: 0, parentId: null, side: null, approval: 0.5, weight: 0 });
const debate = (nodes: ArgumentNode[]): Debate => ({ id: 0, phase: 'rating', feePercentage: 5, nodes: [thesis, ...nodes] });

describe('tallyOf', () => {
  test('a lone supporting argument carries its centered approval into the thesis rating', () => {
    // Mirrors the centered tally (ADR-0012): a childless argument's rating is 2a - 1.
    const impacts = tallyOf(debate([node({ id: 1, approval: 0.8 })]));
    expect(impacts.get(1)?.impact).toBeCloseTo(0.6);
    expect(impacts.get(0)?.rating).toBeCloseTo(0.6);
  });

  test('an opposing argument pulls the thesis down', () => {
    const impacts = tallyOf(debate([node({ id: 1, side: 'con', approval: 0.8 })]));
    expect(impacts.get(1)?.impact).toBeCloseTo(-0.6);
    expect(impacts.get(0)?.rating).toBeCloseTo(-0.6);
  });

  test('a neutral market moves nothing', () => {
    // The seed floor is the neutral point: 50% approval carries no conviction either way.
    const impacts = tallyOf(debate([node({ id: 1, approval: 0.5 })]));
    expect(impacts.get(1)?.impact).toBe(0);
    expect(impacts.get(0)?.rating).toBe(0);
  });

  test('draft arguments contribute nothing and weigh nothing until they lock in', () => {
    const impacts = tallyOf(
      debate([node({ id: 1, approval: 0.8, state: 'created' }), node({ id: 2, approval: 0.8, weight: 10 })]),
    );
    expect(impacts.get(1)?.impact).toBe(0);
    // The final sibling keeps its full share; the draft joins the tally only once final.
    expect(impacts.get(2)?.impact).toBeCloseTo(0.6);
    expect(impacts.get(0)?.rating).toBeCloseTo(0.6);
  });

  test('descendants correct their parent in proportion to their stake', () => {
    // A fully-approved 10-stake pro child against a 10-stake neutral parent market:
    // rating(parent) = (0 x 10 + 1.0 x 10) / 20 = 0.5, carried at the full sibling share.
    const impacts = tallyOf(
      debate([node({ id: 1, approval: 0.5 }), node({ id: 2, parentId: 1, approval: 1.0 })]),
    );
    expect(impacts.get(2)?.impact).toBeCloseTo(1.0);
    expect(impacts.get(1)?.impact).toBeCloseTo(0.5);
    expect(impacts.get(0)?.rating).toBeCloseTo(0.5);
  });

  test('siblings split by stake', () => {
    const impacts = tallyOf(
      debate([node({ id: 1, approval: 0.8, weight: 30 }), node({ id: 2, side: 'con', approval: 0.8, weight: 10 })]),
    );
    expect(impacts.get(1)?.impact).toBeCloseTo(0.6 * 0.75);
    expect(impacts.get(2)?.impact).toBeCloseTo(-0.6 * 0.25);
    expect(impacts.get(0)?.rating).toBeCloseTo(0.45 - 0.15);
  });

  test('a sibling speaks with its whole subtree stake, mirroring the contract', () => {
    // The contract's test_siblingsWeighWithTheirWholeSubtreesStake: A pro 0.9 (10) as a leaf,
    // B pro seeded neutral (10) carrying a 0.9-approval 40-stake pro child. Centered: B's
    // rating (0 x 10 + 0.8 x 40)/50 = 0.64 folds in at subtree weight 50 against A's 10.
    const impacts = tallyOf(
      debate([
        node({ id: 1, approval: 0.9 }),
        node({ id: 2, approval: 0.5 }),
        node({ id: 3, parentId: 2, approval: 0.9, weight: 40 }),
      ]),
    );
    expect(impacts.get(3)?.impact).toBeCloseTo(0.8);
    expect(impacts.get(2)?.impact).toBeCloseTo(0.64 * (50 / 60));
    expect(impacts.get(1)?.impact).toBeCloseTo(0.8 * (10 / 60));
    expect(impacts.get(0)?.rating).toBeCloseTo((0.8 * 10 + 0.64 * 50) / 60);
  });

  test('a refuted argument moves nothing but keeps its weight', () => {
    // The live scenario behind the clamp (debate 4, argument 7): an attack demolished by its
    // own counter-arguments. Its rating goes negative - (0 x 10 - 0.8 x 30) / 40 = -0.6 - and
    // without the clamp its con stance would negate that into SUPPORT for the thesis. With it,
    // the attack folds at zero strength but full subtree weight (40 of 50), so the surviving
    // supporter is dampened to 0.8 x 10/50, not restored to its lone voice.
    const impacts = tallyOf(
      debate([
        node({ id: 1, approval: 0.9 }),
        node({ id: 2, side: 'con', approval: 0.5 }),
        node({ id: 3, parentId: 2, side: 'con', approval: 0.9, weight: 30 }),
      ]),
    );
    expect(impacts.get(3)?.impact).toBeCloseTo(-0.8);
    expect(impacts.get(2)?.impact).toBeCloseTo(0);
    expect(impacts.get(0)?.rating).toBeCloseTo((0.8 * 10) / 50);
  });

  test('an argument-less debate reads neutral', () => {
    expect(tallyOf(debate([])).get(0)?.rating).toBe(0);
  });
});

describe('formatImpact', () => {
  test('signed percentages', () => {
    expect(formatImpact(0.4)).toBe('+40%');
    expect(formatImpact(-0.123)).toBe('−12%');
    expect(formatImpact(0)).toBe('±0%');
  });
});

describe('tallyOf ratings', () => {
  test('an undebated argument is rated exactly what its market says', () => {
    const tally = tallyOf(debate([node({ id: 1, approval: 0.8 })]));
    expect(tally.get(1)?.rating).toBeCloseTo(0.6);
  });

  test('a debated argument parts from its market by what its sub-arguments say', () => {
    // The showcase shape: a market at +40% whose own objection is answered - the card shows the
    // two figures side by side, and they disagree.
    const tally = tallyOf(
      debate([
        node({ id: 1, side: 'con', approval: 0.7, weight: 30 }),
        node({ id: 2, parentId: 1, side: 'con', approval: 0.9, weight: 50 }),
      ]),
    );
    // Its own market reads +40%, but the objection beneath it drags the rating negative.
    expect(2 * 0.7 - 1).toBeCloseTo(0.4);
    expect(tally.get(1)!.rating).toBeLessThan(0);
    // Refuted, it moves its parent by nothing at all - clamped, never handed to the other side.
    expect(tally.get(1)?.impact).toBe(0);
  });

  test('a draft is rated by its own market and moves nothing', () => {
    const tally = tallyOf(debate([node({ id: 1, approval: 0.8, state: 'created' })]));
    expect(tally.get(1)?.rating).toBeCloseTo(0.6);
    expect(tally.get(1)?.impact).toBe(0);
  });

  test('the thesis owns no market, so its rating is its arguments and it moves nothing', () => {
    const tally = tallyOf(debate([node({ id: 1, approval: 0.8 })]));
    expect(tally.get(0)?.rating).toBeCloseTo(0.6);
    expect(tally.get(0)?.impact).toBe(0);
  });
});
