import { BountySettings } from 'deliberate-frontend';

const noop = () => {};

/** A transform-containing frame anchors the modal's fixed backdrop inside the card. */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ transform: 'translateZ(0)', width: 540, height: 760, position: 'relative' }}>{children}</div>
);

const eurc = { address: '0x808456652fdb597867f38412077A9182bf77359F', symbol: 'EURC', decimals: 6 };

/** No bounty: the preset row shows the choice, and the amount field stays out of the way. */
export const NoBounty = () => (
  <Frame>
    <BountySettings bounty={null} onChange={noop} onClose={noop} />
  </Frame>
);

/** A funded bounty: the token chip is active and the amount reads in human units. */
export const FundedInEurc = () => (
  <Frame>
    <BountySettings bounty={{ token: eurc, amount: 2_000_000n }} onChange={noop} onClose={noop} />
  </Frame>
);

/** Token named, funding left to top-ups - a zero amount is a legitimate configuration. */
export const TokenNamedZeroAmount = () => (
  <Frame>
    <BountySettings bounty={{ token: eurc, amount: 0n }} onChange={noop} onClose={noop} />
  </Frame>
);
