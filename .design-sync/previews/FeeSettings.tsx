import { FeeSettings } from 'deliberate-frontend';

const noop = () => {};

/** A transform-containing frame anchors the modal's fixed backdrop inside the card. */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ transform: 'translateZ(0)', width: 500, height: 560, position: 'relative' }}>{children}</div>
);

/** The default the creator starts from: a 1% fee to the staked argument's creator. */
export const Default = () => (
  <Frame>
    <FeeSettings feePercentage={1} onChange={noop} onClose={noop} />
  </Frame>
);

/** Zero is a legitimate choice - correcting a mispricing then costs nothing but the risk. */
export const NoFee = () => (
  <Frame>
    <FeeSettings feePercentage={0} onChange={noop} onClose={noop} />
  </Frame>
);

/** Above the contract's ceiling: the blocking error the create button reads. */
export const AboveTheCeiling = () => (
  <Frame>
    <FeeSettings feePercentage={120} onChange={noop} onClose={noop} />
  </Frame>
);
