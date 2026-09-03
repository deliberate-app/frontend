import { useEffect, useRef, useState } from 'react';
import { AddressBadge } from './AddressBadge';

/** An account address: identicon plus shortened form, full on hover, copied to the clipboard on click. */
export function AddressChip({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard access denied - the full address is still on the tooltip.
    }
  };

  return (
    <button
      type="button"
      className="address"
      title={`${address} - click to copy`}
      onClick={copy}
    >
      <AddressBadge address={address} label={copied ? 'copied ✓' : undefined} />
    </button>
  );
}
