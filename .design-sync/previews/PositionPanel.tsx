import { PositionPanel } from 'deliberate-frontend';

const noop = async () => {};
// Hoisted so the loader keeps one identity - the panel reloads whenever `load` changes.
const bothSides = async () => ({ proShares: 24, conShares: 7, claimableFees: 3 });
const sharesOnly = async () => ({ proShares: 41, conShares: 0, claimableFees: 0 });
const feesOnly = async () => ({ proShares: 0, conShares: 0, claimableFees: 12 });

/** A rater holding both sides, with creator fees waiting from their own argument. */
export const SharesAndFees = () => (
  <div style={{ maxWidth: 640 }}>
    <PositionPanel argumentId={1} load={bothSides} onRedeem={noop} onClaimFees={noop} />
  </div>
);

/** Shares only: one redeem button, no fee claim. */
export const SharesOnly = () => (
  <div style={{ maxWidth: 640 }}>
    <PositionPanel argumentId={2} load={sharesOnly} onRedeem={noop} onClaimFees={noop} />
  </div>
);

/** The argument's creator who never staked: fees to claim, nothing to redeem. */
export const FeesOnly = () => (
  <div style={{ maxWidth: 640 }}>
    <PositionPanel argumentId={3} load={feesOnly} onRedeem={noop} onClaimFees={noop} />
  </div>
);
