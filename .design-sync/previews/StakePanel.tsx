import { StakePanel } from 'deliberate-frontend';

const noop = async () => {};

/** Rating controls as they sit under the focused argument: stance-free, fee named in the hint. */
export const Default = () => (
  <div style={{ maxWidth: 560 }}>
    <StakePanel tokens={100} feePercentage={1} onStake={noop} />
  </div>
);

/** A debate whose creator set no market fee - the hint says so rather than going quiet. */
export const NoMarketFee = () => (
  <div style={{ maxWidth: 560 }}>
    <StakePanel tokens={100} feePercentage={0} onStake={noop} />
  </div>
);

/** A thin balance: the amount input caps at what the participant still holds. */
export const AlmostSpent = () => (
  <div style={{ maxWidth: 560 }}>
    <StakePanel tokens={6} feePercentage={5} onStake={noop} />
  </div>
);
