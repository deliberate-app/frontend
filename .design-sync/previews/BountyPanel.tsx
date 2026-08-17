import { BountyPanel } from 'deliberate-frontend';

const NOW = 1_784_700_000;
const CREATOR = '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9';
const RATER = '0x990c8E1B70Ee0b0B4bE9D8B5F0f3aD8f9d0B27a1';

const nodes = [
  {
    id: 0,
    parentId: null,
    side: null,
    text: 'School days should start later.',
    approval: 0.5,
    weight: 0,
    state: 'final' as const,
    finalizationTime: NOW - 90_000,
    creator: CREATOR,
  },
];

/** `claimEndTime` decides the window; the pool and what is already claimed decide the remainder. */
const debateWith = (claimEndTime: number, claimed: bigint, swept = false) => ({
  id: 0,
  phase: 'finished' as const,
  feePercentage: 1,
  nodes,
  timing: { editingEndTime: NOW - 80_000, ratingEndTime: NOW - 40_000, chainTime: NOW, loadedAt: NOW },
  approved: true,
  bounty: {
    token: '0x808456652fdb597867f38412077A9182bf77359F',
    symbol: 'EURC',
    decimals: 6,
    pool: 2_000_000n,
    claimed,
    swept,
    claimEndTime,
  },
});

/** The transaction surface the panel drives; only the fields it reads are filled in. */
const txFor = (account: string, bountyClaimed = false) =>
  ({
    account,
    joined: true,
    bountyClaimed,
    loadPositions: async () => [],
    claimBounty: async () => {},
    sweepBounty: async () => {},
  }) as never;

/** The claim window is open and the account has not claimed: one settle-and-claim button. */
export const ClaimWindowOpen = () => (
  <div style={{ maxWidth: 640 }}>
    <BountyPanel debate={debateWith(NOW + 500_000, 0n)} tx={txFor(RATER)} now={NOW} />
  </div>
);

/** Already claimed: the button gives way to the settled state, the pool showing what has been paid. */
export const AlreadyClaimed = () => (
  <div style={{ maxWidth: 640 }}>
    <BountyPanel debate={debateWith(NOW + 200_000, 1_250_000n)} tx={txFor(RATER, true)} now={NOW} />
  </div>
);

/** Window closed with a remainder left, viewed by the debate's creator: the sweep. */
export const CreatorSweep = () => (
  <div style={{ maxWidth: 640 }}>
    <BountyPanel debate={debateWith(NOW - 60, 1_250_000n)} tx={txFor(CREATOR)} now={NOW} />
  </div>
);
