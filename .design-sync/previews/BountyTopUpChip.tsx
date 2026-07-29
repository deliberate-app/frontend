import { useEffect, useRef, type ReactNode } from 'react';
import { BountyTopUpChip } from 'deliberate-frontend';

const NOW = 1_784_700_000;

const debate = {
  id: 0,
  phase: 'rating' as const,
  feePercentage: 1,
  nodes: [
    {
      id: 0,
      parentId: null,
      side: null,
      text: 'School days should start later.',
      approval: 0.5,
      weight: 0,
      state: 'final' as const,
      finalizationTime: NOW - 9_000,
    },
  ],
  timing: { editingEndTime: NOW - 600, ratingEndTime: NOW + 40_000, chainTime: NOW, loadedAt: NOW },
  bounty: {
    token: '0x808456652fdb597867f38412077A9182bf77359F',
    symbol: 'EURC',
    decimals: 6,
    pool: 2_000_000n,
    claimed: 0n,
    swept: false,
    claimEndTime: 0,
  },
};

/** The transaction surface the chip drives; only the field it reads is filled in. */
const tx = { fundBounty: async () => {} } as never;

/** A transform-containing frame anchors the modal's fixed backdrop inside the card. */
const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ transform: 'translateZ(0)', width: 520, height: 620, position: 'relative', padding: '0.5rem 1rem' }}>
    {children}
  </div>
);

/** Opens the modal through the chip's own plus, so the surface is reached the way a user reaches it. */
const Opened = ({ children }: { children: ReactNode }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelector('button')?.click();
  }, []);
  return <div ref={host}>{children}</div>;
};

/** In the thesis meta with a wallet connected: the figure plus the top-up affordance. */
export const WithTopUp = () => (
  <p className="focus-meta">
    <BountyTopUpChip debate={debate} tx={tx} />
  </p>
);

/** Without a wallet - and once the debate is finished - the figure is read-only. */
export const ReadOnly = () => (
  <p className="focus-meta">
    <BountyTopUpChip debate={debate} tx={null} />
  </p>
);

/** The top-up modal: an irreversible donation, so it confirms explicitly. */
export const TopUpModal = () => (
  <Frame>
    <Opened>
      <p className="focus-meta">
        <BountyTopUpChip debate={debate} tx={tx} />
      </p>
    </Opened>
  </Frame>
);
