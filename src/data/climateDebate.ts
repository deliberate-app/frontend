import type { ArgumentNode, Debate } from '../types';

/**
 * Sample debate modeled on kialo.com's "Should humans act to fight climate change?"
 * (https://www.kialo.com/should-humans-act-to-fight-climate-change-4540).
 * Approval = the rating market's pro share; weight = vote tokens staked.
 * A mid-Rating snapshot: every argument is already final.
 */
const nodes: Array<Omit<ArgumentNode, 'state' | 'finalizationTime'>> = [
  {
    id: 0,
    parentId: null,
    side: null,
    text: 'Humans should take significant action to fight climate change.',
    approval: 0.68,
    weight: 412,
  },

  // ── Pros of the thesis ────────────────────────────────────────────────
  {
    id: 1,
    parentId: 0,
    side: 'pro',
    text: 'Unmitigated climate change threatens the habitability of large parts of the planet.',
    approval: 0.74,
    weight: 86,
  },
  {
    id: 2,
    parentId: 0,
    side: 'pro',
    text: 'Acting now is far cheaper than paying for the damages later.',
    approval: 0.66,
    weight: 64,
  },
  {
    id: 3,
    parentId: 0,
    side: 'pro',
    text: 'Those who caused the problem have a moral responsibility to fix it.',
    approval: 0.58,
    weight: 41,
  },
  {
    id: 4,
    parentId: 0,
    side: 'pro',
    text: 'The energy transition creates jobs and cleaner, healthier cities.',
    approval: 0.61,
    weight: 37,
  },

  // ── Cons of the thesis ────────────────────────────────────────────────
  {
    id: 5,
    parentId: 0,
    side: 'con',
    text: 'Drastic action would slow the growth poor countries need to escape poverty.',
    approval: 0.44,
    weight: 52,
  },
  {
    id: 6,
    parentId: 0,
    side: 'con',
    text: 'Without global enforcement, single actors who act alone only hurt themselves.',
    approval: 0.39,
    weight: 46,
  },
  {
    id: 7,
    parentId: 0,
    side: 'con',
    text: 'Technological innovation will outpace the problem without forced intervention.',
    approval: 0.35,
    weight: 33,
  },
  {
    id: 8,
    parentId: 0,
    side: 'con',
    text: 'Climate models overstate certainty; policy should wait for better evidence.',
    approval: 0.22,
    weight: 25,
  },

  // ── Beneath pro #1 (habitability) ─────────────────────────────────────
  {
    id: 9,
    parentId: 1,
    side: 'pro',
    text: 'Heatwaves, droughts, and rising seas already displace millions of people every year.',
    approval: 0.71,
    weight: 28,
  },
  {
    id: 10,
    parentId: 1,
    side: 'pro',
    text: 'Feedback loops such as permafrost thaw risk locking in irreversible warming.',
    approval: 0.63,
    weight: 19,
  },
  {
    id: 11,
    parentId: 1,
    side: 'con',
    text: 'Human societies have adapted to major environmental shifts throughout history.',
    approval: 0.41,
    weight: 14,
  },

  // ── Beneath pro #2 (cheaper now) ──────────────────────────────────────
  {
    id: 12,
    parentId: 2,
    side: 'pro',
    text: 'Damage estimates for unchecked warming reach a large share of global GDP by 2100, dwarfing mitigation costs.',
    approval: 0.64,
    weight: 22,
  },
  {
    id: 13,
    parentId: 2,
    side: 'con',
    text: 'Cost projections spanning a century are too uncertain to justify specific spending today.',
    approval: 0.45,
    weight: 17,
  },

  // ── Beneath pro #4 (transition benefits) ──────────────────────────────
  {
    id: 14,
    parentId: 4,
    side: 'pro',
    text: 'Renewables are now the cheapest source of new electricity in most of the world.',
    approval: 0.72,
    weight: 15,
  },
  {
    id: 15,
    parentId: 4,
    side: 'con',
    text: 'Fossil-fuel regions face concentrated job losses that transition programs rarely replace.',
    approval: 0.49,
    weight: 12,
  },

  // ── Beneath con #5 (development) ──────────────────────────────────────
  {
    id: 16,
    parentId: 5,
    side: 'pro',
    text: 'Cheap fossil energy underpinned every industrialization to date.',
    approval: 0.55,
    weight: 16,
  },
  {
    id: 17,
    parentId: 5,
    side: 'con',
    text: 'Distributed renewables can leapfrog fossil grids, as mobile networks leapfrogged landlines.',
    approval: 0.6,
    weight: 18,
  },

  // ── Beneath con #6 (free riding) ──────────────────────────────────────
  {
    id: 18,
    parentId: 6,
    side: 'con',
    text: 'Coordination problems argue for building enforcement mechanisms, not for doing nothing.',
    approval: 0.62,
    weight: 15,
  },

  // ── Beneath con #7 (innovation) ───────────────────────────────────────
  {
    id: 19,
    parentId: 7,
    side: 'pro',
    text: 'Solar power costs fell by roughly ninety percent within a decade.',
    approval: 0.69,
    weight: 13,
  },
  {
    id: 20,
    parentId: 7,
    side: 'con',
    text: 'That cost fall was itself the product of decades of public subsidies and policy support.',
    approval: 0.58,
    weight: 14,
  },

  // ── Beneath con #8 (uncertainty) ──────────────────────────────────────
  {
    id: 21,
    parentId: 8,
    side: 'con',
    text: 'Waiting for certainty is itself a bet — and the downside of being wrong is catastrophic.',
    approval: 0.67,
    weight: 16,
  },
];

export const climateDebate: Debate = {
  id: 0,
  phase: 'rating',
  feePercentage: 5,
  nodes: nodes.map((node) => ({ ...node, state: 'final', finalizationTime: 0 })),
};

/** Builds a compact finished sample debate, so the browse list and focus view show both verdicts. */
function finishedDebate(
  id: number,
  approved: boolean,
  theses: [string, string, string],
  approvals: [number, number, number],
  weights: [number, number, number],
): Debate {
  const [thesis, pro, con] = theses;
  return {
    id,
    phase: 'finished',
    feePercentage: 5,
    approved,
    nodes: (
      [
        { id: 0, parentId: null, side: null, text: thesis, approval: approvals[0], weight: weights[0] },
        { id: 1, parentId: 0, side: 'pro', text: pro, approval: approvals[1], weight: weights[1] },
        { id: 2, parentId: 0, side: 'con', text: con, approval: approvals[2], weight: weights[2] },
      ] as const
    ).map((node) => ({ ...node, state: 'final' as const, finalizationTime: 0 })),
  };
}

/** A finished sample debate whose thesis was confirmed, with a (fully settled) USDC bounty. */
export const confirmedDebate: Debate = {
  ...finishedDebate(
    1,
    true,
    [
      'Cities should release their transit data openly.',
      'Open schedules let anyone build better route planners than the agency ever ships.',
      'Publishing feeds costs money that could go into service instead.',
    ],
    [0.71, 0.82, 0.31],
    [58, 34, 12],
  ),
  participantsCount: 12,
  // Swept, so no clock-dependent claim countdown renders on sample data.
  bounty: {
    token: '0x036CBD53842c5426634e7929541eC2318f3dCF7e',
    symbol: 'USDC',
    decimals: 6,
    pool: 250_000_000n,
    claimed: 34_000_000n,
    swept: true,
    claimEndTime: 1,
  },
};

/** A sample debate still in its editing phase; the newest argument is an unlocked draft. */
export const editingDebate: Debate = {
  id: 3,
  phase: 'editing',
  feePercentage: 5,
  participantsCount: 3,
  // A running bounty: fundable, nothing claimable yet.
  bounty: {
    token: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18,
    pool: 500_000_000_000_000_000n,
    claimed: 0n,
    swept: false,
    claimEndTime: 0,
  },
  nodes: [
    {
      id: 0,
      parentId: null,
      side: null,
      text: 'School days should start later.',
      approval: 0.5,
      weight: 30,
      state: 'final',
      finalizationTime: 0,
    },
    {
      id: 1,
      parentId: 0,
      side: 'pro',
      text: 'Teenagers demonstrably learn better after nine.',
      approval: 0.64,
      weight: 20,
      state: 'final',
      finalizationTime: 0,
    },
    {
      id: 2,
      parentId: 0,
      side: 'con',
      text: 'Buses, parents, and sports all key off the early bell.',
      approval: 0.5,
      weight: 10,
      state: 'created',
      finalizationTime: 0,
    },
  ],
};

/** A finished sample debate whose thesis was objected. */
export const objectedDebate: Debate = finishedDebate(
  2,
  false,
  [
    'Voting should be mandatory.',
    'Full turnout makes the result speak for everyone.',
    'A forced ballot measures attendance, not conviction.',
  ],
  [0.38, 0.35, 0.78],
  [64, 15, 41],
);
