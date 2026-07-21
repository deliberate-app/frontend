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
  test('a supporting argument adds half its approval; the thesis nets it', () => {
    // Mirrors the tally: an 80% pro argument alone yields a positive outcome.
    const impacts = impactsOf(debate([node({ id: 1, approval: 0.8 })]));
    expect(impacts.get(1)).toBeCloseTo(0.4);
    expect(impacts.get(0)).toBeCloseTo(0.4);
  });

  test('an opposing argument pulls the thesis down', () => {
    const impacts = impactsOf(debate([node({ id: 1, side: 'con', approval: 0.8 })]));
    expect(impacts.get(1)).toBeCloseTo(-0.4);
    expect(impacts.get(0)).toBeCloseTo(-0.4);
  });

  test('draft arguments carry weight but contribute nothing, like in the tally', () => {
    const impacts = impactsOf(
      debate([node({ id: 1, approval: 0.8, state: 'created' }), node({ id: 2, approval: 0.8, weight: 10 })]),
    );
    expect(impacts.get(1)).toBe(0);
    // The final sibling's share is diluted by the draft's weight: 0.4 x 10/20.
    expect(impacts.get(2)).toBeCloseTo(0.2);
    expect(impacts.get(0)).toBeCloseTo(0.2);
  });

  test('descendants blend into their parent before it hits the thesis', () => {
    // A fully-approved pro child lifts its 50% parent: blend(child) = 0.5,
    // blend(parent) = 0.5 x 0.5 + 0.5 x 0.5 = 0.5.
    const impacts = impactsOf(
      debate([node({ id: 1, approval: 0.5 }), node({ id: 2, parentId: 1, approval: 1.0 })]),
    );
    expect(impacts.get(2)).toBeCloseTo(0.5);
    expect(impacts.get(1)).toBeCloseTo(0.5);
    expect(impacts.get(0)).toBeCloseTo(0.5);
  });

  test('siblings split by stake', () => {
    const impacts = impactsOf(
      debate([node({ id: 1, approval: 0.8, weight: 30 }), node({ id: 2, side: 'con', approval: 0.8, weight: 10 })]),
    );
    expect(impacts.get(1)).toBeCloseTo(0.4 * 0.75);
    expect(impacts.get(2)).toBeCloseTo(-0.4 * 0.25);
    expect(impacts.get(0)).toBeCloseTo(0.3 - 0.1);
  });
});

describe('formatImpact', () => {
  test('signed percentages', () => {
    expect(formatImpact(0.4)).toBe('+40%');
    expect(formatImpact(-0.123)).toBe('−12%');
    expect(formatImpact(0)).toBe('±0%');
  });
});
