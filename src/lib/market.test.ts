import { describe, expect, test } from 'bun:test';
import type { ArgumentNode } from '../types';
import { reservesOf, upsideOf } from './market';

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
