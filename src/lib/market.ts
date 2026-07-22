import type { ArgumentNode } from '../types';

/** An argument market's share reserves; approval (the good-argument share price) is `con / (pro + con)`. */
export interface MarketReserves {
  pro: number;
  con: number;
}

/**
 * The market's reserves: exact when the data source carried them (chain and indexer both do),
 * else derived from `approval × weight` - only bundled sample data lacks reserves, and the
 * derivation keeps its markets renderable at the right price.
 */
export function reservesOf(node: ArgumentNode): MarketReserves {
  if (node.proReserve !== undefined && node.conReserve !== undefined) {
    return { pro: node.proReserve, con: node.conReserve };
  }
  return {
    pro: Math.round((1 - node.approval) * node.weight),
    con: Math.round(node.approval * node.weight),
  };
}

/**
 * The market's upside: what a corrector can gain from it, per direction, before fees. Buying
 * good-argument shares ("underrated") frees at most the pro reserve - as the stake grows, the
 * shares freed beyond the tokens paid approach the reserve, each redeeming at up to one token -
 * and buying bad-argument shares ("overrated") at most the con reserve. This is the honest
 * rater-attention beacon: the prize is the seeded deposit plus whatever mispricing others left
 * behind, extractable only by being right.
 */
export function upsideOf(node: ArgumentNode): { underrated: number; overrated: number } {
  const { pro, con } = reservesOf(node);
  return { underrated: pro, overrated: con };
}

/** The shared tooltip explaining an argument's upside figures. */
export function upsideHint(upside: { underrated: number; overrated: number }): string {
  return (
    `The most correcting this market can gain: up to ${upside.underrated} ⬡ if it proves underrated, ` +
    `up to ${upside.overrated} ⬡ if overrated (before fees).`
  );
}
