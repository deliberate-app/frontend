import { describe, expect, test } from 'bun:test';
import type { ArgumentNode, Debate } from '../types';
import { formatImpact, impactsOf } from './impact';

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

describe('impactsOf', () => {
  test('a lone supporting argument sways the thesis with its full approval', () => {
    // Mirrors the stake-weighted tally (ADR-0011): a childless argument keeps its own approval.
    const impacts = impactsOf(debate([node({ id: 1, approval: 0.8 })]));
    expect(impacts.get(1)).toBeCloseTo(0.8);
    expect(impacts.get(0)).toBeCloseTo(0.8);
  });

  test('an opposing argument pulls the thesis down', () => {
    const impacts = impactsOf(debate([node({ id: 1, side: 'con', approval: 0.8 })]));
    expect(impacts.get(1)).toBeCloseTo(-0.8);
    expect(impacts.get(0)).toBeCloseTo(-0.8);
  });

  test('draft arguments contribute nothing and weigh nothing until they lock in', () => {
    const impacts = impactsOf(
      debate([node({ id: 1, approval: 0.8, state: 'created' }), node({ id: 2, approval: 0.8, weight: 10 })]),
    );
    expect(impacts.get(1)).toBe(0);
    // The final sibling keeps its full share; the draft joins the tally only once final.
    expect(impacts.get(2)).toBeCloseTo(0.8);
    expect(impacts.get(0)).toBeCloseTo(0.8);
  });

  test('descendants correct their parent in proportion to their stake', () => {
    // A fully-approved 10-stake pro child against a 10-stake neutral parent market:
    // blend(parent) = (0.5 x 10 + 1.0 x 10) / 20 = 0.75, carried at the full sibling share.
    const impacts = impactsOf(
      debate([node({ id: 1, approval: 0.5 }), node({ id: 2, parentId: 1, approval: 1.0 })]),
    );
    expect(impacts.get(2)).toBeCloseTo(1.0);
    expect(impacts.get(1)).toBeCloseTo(0.75);
    expect(impacts.get(0)).toBeCloseTo(0.75);
  });

  test('siblings split by stake', () => {
    const impacts = impactsOf(
      debate([node({ id: 1, approval: 0.8, weight: 30 }), node({ id: 2, side: 'con', approval: 0.8, weight: 10 })]),
    );
    expect(impacts.get(1)).toBeCloseTo(0.8 * 0.75);
    expect(impacts.get(2)).toBeCloseTo(-0.8 * 0.25);
    expect(impacts.get(0)).toBeCloseTo(0.6 - 0.2);
  });

  test('a sibling speaks with its whole subtree stake, mirroring the contract', () => {
    // The contract's test_siblingsWeighWithTheirWholeSubtreesStake: A pro 0.9 (10) as a leaf,
    // B pro 0.5 (10) carrying a 0.9-approval 40-stake pro child. B's blend (0.5x10 + 0.9x40)/50
    // = 0.82 folds in at subtree weight 50 against A's 10.
    const impacts = impactsOf(
      debate([
        node({ id: 1, approval: 0.9 }),
        node({ id: 2, approval: 0.5 }),
        node({ id: 3, parentId: 2, approval: 0.9, weight: 40 }),
      ]),
    );
    expect(impacts.get(3)).toBeCloseTo(0.9);
    expect(impacts.get(2)).toBeCloseTo(0.82 * (50 / 60));
    expect(impacts.get(1)).toBeCloseTo(0.9 * (10 / 60));
    expect(impacts.get(0)).toBeCloseTo((0.9 * 10 + 0.82 * 50) / 60);
  });

  test('an argument-less debate reads neutral', () => {
    expect(impactsOf(debate([])).get(0)).toBe(0);
  });
});

describe('formatImpact', () => {
  test('signed percentages', () => {
    expect(formatImpact(0.4)).toBe('+40%');
    expect(formatImpact(-0.123)).toBe('−12%');
    expect(formatImpact(0)).toBe('±0%');
  });
});
