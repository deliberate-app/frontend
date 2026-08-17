import { AddressChip } from 'deliberate-frontend';

/** The interactive form of the address badge: hover for the full address, click to copy it. */
export const Default = () => <AddressChip address="0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9" />;

/** In the focus kicker row, where it names the author beside the argument's stance. */
export const InKickerRow = () => (
  <div className="focus-kicker-row" style={{ maxWidth: 360 }}>
    <p className="focus-kicker">Pro argument</p>
    <AddressChip address="0x990c8E1B70Ee0b0B4bE9D8B5F0f3aD8f9d0B27a1" />
  </div>
);
