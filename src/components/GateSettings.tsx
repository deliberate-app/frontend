import { useState } from 'react';
import { isAddress, zeroAddress, type Address } from 'viem';
import { shortAddress } from '../lib/address';
import { Modal } from './Modal';
import { RegistryManager } from './RegistryManager';

/**
 * Who may join a debate, as chosen before creation. Three shapes, all expressed to the contract as
 * one registry address: the zero address for an open debate, any `IIdentityRegistry` by address, and
 * the deployment's Circles preset - a registry admitting any Circles human. A registry picked or
 * made here carries the name it was picked by, so the chip can say it.
 */
export type GateDraft =
  { mode: 'open' } | { mode: 'circles'; address: Address } | { mode: 'registry'; address: Address; label?: string };

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
      return gate.label ?? `members of ${shortAddress(gate.address)}`;
  }
}

/**
 * The cogwheel modal choosing a debate's join gate before creation. Edits apply live, like the other
 * settings modals: the chip behind it updates as the choice changes, and closing is the only exit.
 *
 * The two named presets come first (principle 7), and everything else is a registry. Which registry
 * is the manager's question, not this modal's, so the manager itself is embedded rather than
 * reimplemented here - the same lists, the same tabs and the same way of making one as the wallet
 * menu offers.
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
    <Modal title="Who may join" onClose={onClose} wide>
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
      </div>

      <RegistryManager
        circlesPreset={circlesRegistry}
        picked={gate.mode === 'registry' ? gate.address : undefined}
        onPick={(registry, label) => onChange({ mode: 'registry', address: registry.address, label })}
      />

      <label className="duration-field">
        <span className="duration-label">Any other registry</span>
        <input
          type="text"
          className="text-input"
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
        <span className="duration-hint">
          Any identity registry by address, including one this app did not make. The same registry can serve any number
          of debates, and it is asked on each join - so an account removed later cannot join, while debates it already
          joined are unaffected.
        </span>
      </label>
      {customAddress !== '' && !customValid && <p className="action-error">Not an address.</p>}

      {gate.mode !== 'open' && (
        <p className="composer-hint">
          Joining is refused to accounts the registry does not know. Choose <em>Everyone</em> for a debate anyone may
          join.
        </p>
      )}
    </Modal>
  );
}
