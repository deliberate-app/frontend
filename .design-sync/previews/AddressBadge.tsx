import { AddressBadge } from 'deliberate-frontend';

/** The default: deterministic identicon plus the canonical `0x1234…abcd` truncation. */
export const Default = () => <AddressBadge address="0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9" />;

/** Distinct accounts get distinct identicons - the badge is the app's one account rendering. */
export const DistinctAccounts = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
    <AddressBadge address="0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9" />
    <AddressBadge address="0x990c8E1B70Ee0b0B4bE9D8B5F0f3aD8f9d0B27a1" />
    <AddressBadge address="0x6f71c01803b8B7960a0B145E574ED210C8fF2513" />
  </div>
);

/** With a label the caller supplies its own text - the wallet menu and the copy chip do this. */
export const Labelled = () => (
  <span style={{ display: 'inline-flex', gap: '1.5rem' }}>
    <AddressBadge address="0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9" label="you" />
    <AddressBadge address="0x990c8E1B70Ee0b0B4bE9D8B5F0f3aD8f9d0B27a1" label="copied ✓" />
  </span>
);
