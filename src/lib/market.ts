import type { ArgumentNode, Debate, Side } from '../types';

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
 * and buying bad-argument shares ("overrated") at most the con reserve. The prize is the seeded
 * deposit plus whatever mispricing others left behind, extractable only by being right.
 */
export function upsideOf(node: ArgumentNode): { underrated: number; overrated: number } {
  const { pro, con } = reservesOf(node);
  return { underrated: pro, overrated: con };
}

/** What one stake would do to an argument's market, before it is sent. */
export interface StakePreview {
  /** The part of the stake that goes to the argument's author. */
  fee: number;
  /** The shares the staker would hold: good-argument shares for `pro`, bad-argument for `con`. */
  sharesOut: number;
  /** The market as the stake would leave it. */
  reserves: MarketReserves;
  approval: number;
  weight: number;
}

/**
 * The market after a stake, computed the way the contract quotes it: the fee comes off first
 * (rounded down), the opposite reserve absorbs the net stake, the bought reserve is restored to
 * the constant product rounded up - so a reserve can never drain to zero - and the staker takes
 * the freed shares plus the net amount. Integer throughout, as on-chain, so a preview never
 * promises a share the trade will not deliver.
 */
export function previewStake(node: ArgumentNode, side: Side, amount: number, feePercentage: number): StakePreview {
  const { pro, con } = reservesOf(node);
  const fee = Math.floor((amount * feePercentage) / 100);
  const net = amount - fee;
  const [bought, opposite] = side === 'pro' ? [pro, con] : [con, pro];
  const newOpposite = opposite + net;
  // Ceiling division in integers: the reserves fit uint32, whose product does not fit a double.
  const newBought = Number((BigInt(bought) * BigInt(opposite) + BigInt(newOpposite) - 1n) / BigInt(newOpposite));
  const sharesOut = bought + net - newBought;
  const reserves = side === 'pro' ? { pro: newBought, con: newOpposite } : { pro: newOpposite, con: newBought };
  return {
    fee,
    sharesOut,
    reserves,
    approval: reserves.con / (reserves.pro + reserves.con),
    weight: node.weight + net,
  };
}

/**
 * The debate as a previewed stake would leave it: the one market moved, everything else as it
 * stands - what the tally mirror needs to say how the stake would move the argument's impact.
 */
export function withPreviewedStake(debate: Debate, argumentId: number, preview: StakePreview): Debate {
  return {
    ...debate,
    nodes: debate.nodes.map((node) =>
      node.id === argumentId
        ? {
            ...node,
            approval: preview.approval,
            weight: preview.weight,
            proReserve: preview.reserves.pro,
            conReserve: preview.reserves.con,
          }
        : node,
    ),
  };
}
