import { useState } from 'react';
import { Modal } from './Modal';
import { isAddress, zeroAddress, type Address } from 'viem';
import { shortAddress } from '../lib/address';

/**
 * Who may join a debate, as chosen before creation. Three shapes, all expressed to the contract as one
 * registry address: the zero address for an open debate, any `IIdentityRegistry` by address, and the
 * deployment's Circles preset - a registry admitting any Circles human.
 */
export type GateDraft =
  | { mode: 'open' }
  | { mode: 'circles'; address: Address }
  | { mode: 'registry'; address: Address };

/** The address the contract stores for a gate. */
export function gateAddress(gate: GateDraft): Address {
  return gate.mode === 'open' ? zeroAddress : gate.address;
}

/** How a gate reads on the create panel's chip. */
export function gateLabel(gate: GateDraft): string {
  switch (gate.mode) {
    case 'open':
      return 'open to everyone';
    case 'circles':
      return 'Circles humans';
    case 'registry':
      return `members of ${shortAddress(gate.address)}`;
  }
}

/**
 * The cogwheel modal choosing a debate's join gate before creation. Edits apply live, like the other
 * settings modals: the chip behind it updates as the choice changes, and closing is the only exit.
 */
export function GateSettings({
  gate,
  onChange,
  onClose,
  circlesRegistry,
}: {
  gate: GateDraft;
  onChange: (gate: GateDraft) => void;
  onClose: () => void;
  /** The deployment's Circles preset registry. */
  circlesRegistry: Address;
}) {
  const [customAddress, setCustomAddress] = useState(gate.mode === 'registry' ? gate.address : '');
  const customValid = isAddress(customAddress);

  return (
    <Modal title="Who may join" onClose={onClose}>
      <div className="preset-row">
        <button
          type="button"
          className={`btn btn-small ${gate.mode === 'open' ? 'preset-active' : ''}`}
          onClick={() => onChange({ mode: 'open' })}
        >
          Everyone
        </button>
        <button
          type="button"
          className={`btn btn-small ${gate.mode === 'circles' ? 'preset-active' : ''}`}
          title="Accounts registered as human in Circles on Gnosis Chain."
          onClick={() => onChange({ mode: 'circles', address: circlesRegistry })}
        >
          Circles humans
        </button>
        <button
          type="button"
          className={`btn btn-small ${gate.mode === 'registry' ? 'preset-active' : ''}`}
          onClick={() => {
            if (customValid) onChange({ mode: 'registry', address: customAddress as Address });
          }}
          disabled={!customValid}
        >
          A registry
        </button>
      </div>

      <label className="duration-field">
        <span className="duration-label">Registry</span>
        <span className="duration-inputs">
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            placeholder="0x…"
            value={customAddress}
            onChange={(event) => {
              const next = event.target.value.trim();
              setCustomAddress(next);
              if (isAddress(next)) onChange({ mode: 'registry', address: next as Address });
            }}
          />
        </span>
        <span className="duration-hint">
          Any identity registry by address: an allowlist you maintain, or a Circles adapter anchored on a
          group you curate. The same registry can gate any number of debates, and it is asked on each
          join - so a member removed later cannot join, while debates already joined are unaffected.
        </span>
      </label>

      {gate.mode !== 'open' && (
        <p className="composer-hint">
          Joining is refused to accounts the registry does not know. Choose <em>Everyone</em> for a
          debate anyone may join.
        </p>
      )}
    </Modal>
  );
}
