import { MarketDetail } from 'deliberate-frontend';

const noop = () => {};

/** A transform-containing frame anchors the modal's fixed backdrop inside the card. */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ transform: 'translateZ(0)', width: 540, height: 760, position: 'relative' }}>{children}</div>
);

/** The lifetime fee figure the app reads from the stake history; a fixed one keeps the card stable. */
const feesEarned = (amount: number) => async () => amount;

const node = (approval: number, proReserve: number, conReserve: number) => ({
  id: 1,
  parentId: 0,
  side: 'pro' as const,
  text: 'Teenagers demonstrably learn better after nine.',
  approval,
  proReserve,
  conReserve,
  weight: proReserve + conReserve,
  rating: null,
  state: 'final' as const,
  finalizationTime: 1_784_690_000,
});

/** Well-rated: good-argument shares are scarce, so the point sits low and right on the curve. */
export const HighlyRated = () => (
  <Frame>
    <MarketDetail node={node(0.82, 22, 98)} feePercentage={1} loadFeesEarned={feesEarned(4)} onClose={noop} />
  </Frame>
);

/** Untouched since seeding: reserves equal, the point sits on the neutral diagonal. */
export const NeutralSeed = () => (
  <Frame>
    <MarketDetail node={node(0.5, 60, 60)} feePercentage={1} loadFeesEarned={feesEarned(0)} onClose={noop} />
  </Frame>
);

/** Rated down, and a debate with no market fee - the readout says so instead of a percentage. */
export const RatedDownNoFee = () => (
  <Frame>
    <MarketDetail node={node(0.21, 95, 25)} feePercentage={0} onClose={noop} />
  </Frame>
);
