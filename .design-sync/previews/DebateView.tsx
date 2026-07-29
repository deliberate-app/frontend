import { useEffect, useRef, type ReactNode } from 'react';
import { DebateView } from 'deliberate-frontend';

// The view runs its own clock (useNow), so the schedule is anchored to the real current second -
// a frozen constant would land every cell in the tallying phase.
const NOW = Math.floor(Date.now() / 1000);

const ACCOUNT = '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9';
const OTHER = '0x990c8E1B70Ee0b0B4bE9D8B5F0f3aD8f9d0B27a1';

const node = (
  id: number,
  parentId: number | null,
  side: 'pro' | 'con' | null,
  text: string,
  approval: number,
  pro: number,
  con: number,
  creator = OTHER,
) => ({
  id,
  parentId,
  side,
  text,
  approval,
  proReserve: pro,
  conReserve: con,
  weight: pro + con,
  state: 'final' as const,
  finalizationTime: NOW - 3_600,
  creator,
});

const nodes = [
  node(0, null, null, 'School days should start later.', 0.5, 0, 0, ACCOUNT),
  node(1, 0, 'pro', 'Teenagers demonstrably learn better after nine.', 0.82, 22, 98),
  node(2, 0, 'pro', 'Later starts measurably cut morning traffic.', 0.61, 39, 61),
  node(3, 0, 'con', 'Buses and parent schedules cannot absorb a later start.', 0.31, 45, 20),
  node(4, 1, 'con', 'The cited studies cover only a handful of schools.', 0.44, 34, 26),
  node(5, 3, 'pro', 'Rural routes share buses across two schools.', 0.57, 26, 34),
];

const debate = (over: Record<string, unknown> = {}) => ({
  id: 4,
  phase: 'rating' as const,
  feePercentage: 1,
  nodes,
  timing: { editingEndTime: NOW - 600, ratingEndTime: NOW + 39_600, chainTime: NOW, loadedAt: NOW },
  bounty: {
    token: '0x808456652fdb597867f38412077A9182bf77359F',
    symbol: 'EURC',
    decimals: 6,
    pool: 2_000_000n,
    claimed: 0n,
    swept: false,
    claimEndTime: 0,
  },
  participantsCount: 7,
  ...over,
});

/** The transaction surface of a joined participant; the handlers are inert in previews. */
const tx = {
  account: ACCOUNT,
  joined: true,
  tokens: 100,
  bountyClaimed: false,
  addArgument: async () => {},
  alterArgument: async () => {},
  moveArgument: async () => {},
  stake: async () => {},
  position: async () => ({ proShares: 24, conShares: 0, claimableFees: 3 }),
  loadPositions: async () => [],
  redeem: async () => {},
  redeemBatch: async () => {},
  claimFees: async () => {},
  fundBounty: async () => {},
  claimBounty: async () => {},
  sweepBounty: async () => {},
} as never;

const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ width: 1200, position: 'relative' }}>{children}</div>
);

/** Focus follows a real click on an argument card, the same path a reader takes. */
const FocusCard = ({ nth, children }: { nth: number; children: ReactNode }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelectorAll('button.card')[nth]?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  }, [nth]);
  return <div ref={host}>{children}</div>;
};

/** The thesis in focus during rating: overview map, the claim, and its pro / con columns. */
export const RatingPhase = () => (
  <Frame>
    <DebateView debate={debate()} tx={tx} />
  </Frame>
);

/** An argument in focus: the ancestry rail appears, and the rating controls with it. */
export const ArgumentFocused = () => (
  <Frame>
    <FocusCard nth={0}>
      <DebateView debate={debate()} tx={tx} />
    </FocusCard>
  </Frame>
);

/** Editing: the reply composers open beneath each column instead of the rating controls. */
export const EditingPhase = () => (
  <Frame>
    <DebateView
      debate={debate({
        phase: 'editing',
        timing: { editingEndTime: NOW + 30_000, ratingEndTime: NOW + 80_000, chainTime: NOW, loadedAt: NOW },
      })}
      tx={tx}
    />
  </Frame>
);

/** Finished and confirmed: the verdict on the thesis, and the bounty claim beneath it. */
export const FinishedConfirmed = () => (
  <Frame>
    <DebateView
      debate={debate({
        phase: 'finished',
        approved: true,
        timing: { editingEndTime: NOW - 90_000, ratingEndTime: NOW - 40_000, chainTime: NOW, loadedAt: NOW },
        bounty: {
          token: '0x808456652fdb597867f38412077A9182bf77359F',
          symbol: 'EURC',
          decimals: 6,
          pool: 2_000_000n,
          claimed: 0n,
          swept: false,
          claimEndTime: NOW + 500_000,
        },
      })}
      tx={tx}
    />
  </Frame>
);

/** Without a wallet the same debate is fully readable - every control is simply absent. */
export const ReadOnly = () => (
  <Frame>
    <DebateView debate={debate()} tx={null} />
  </Frame>
);
