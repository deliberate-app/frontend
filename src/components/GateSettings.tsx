import { useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import { useRegistries } from '../data/registries';
import { looksLikeAddress, parseAddressList, shortAddress } from '../lib/address';
import { PickRow, Tabs } from './Choice';
import { Modal } from './Modal';
import { AllowlistPanel, CirclesPanel } from './RegistryManager';

/**
 * Who may join a debate, as chosen before creation. Two shapes, both expressed to the contract as
 * one registry address: the zero address for an open debate, and any `IIdentityRegistry` by
 * address. A registry picked or made here carries the name it was picked by, so the chip can say
 * it.
 */
export type GateDraft = { mode: 'open' } | { mode: 'registry'; address: Address; label?: string };

/** The address the contract stores for a gate. */
export function gateAddress(gate: GateDraft): Address {
  return gate.mode === 'open' ? zeroAddress : gate.address;
}

/** How a gate reads on the create panel's chip. */
export function gateLabel(gate: GateDraft): string {
  return gate.mode === 'open' ? 'open to everyone' : (gate.label ?? `members of ${shortAddress(gate.address)}`);
}

type GateTab = 'everyone' | 'allowlists' | 'circles' | 'custom';

/**
 * The cogwheel modal choosing a debate's join gate before creation. Edits apply live, like the
 * other settings modals: the chip behind it updates as the choice changes, and closing is the only
 * exit.
 *
 * One tab per kind of answer, and a tab is a place rather than a choice - a reader can look through
 * all four and change nothing. The dot on the rail says which tab the current choice lives in, so
 * looking around never loses track of it. Every tab is picked the same way, from a row; "Everyone"
 * simply has one row to pick.
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
  const access = useRegistries();

  // Which tab the current choice lives in. A registry the index does not know is a custom one,
  // which is also where an address typed by hand lands.
  const held = access?.registries.find(
    (registry) => gate.mode === 'registry' && registry.address.toLowerCase() === gate.address.toLowerCase(),
  );
  const currentTab: GateTab =
    gate.mode === 'open'
      ? 'everyone'
      : gate.address.toLowerCase() === circlesRegistry.toLowerCase()
        ? 'circles'
        : held
          ? held.kind === 'allowlist'
            ? 'allowlists'
            : 'circles'
          : 'custom';

  const [tab, setTab] = useState<GateTab>(currentTab);
  const [customAddress, setCustomAddress] = useState(
    currentTab === 'custom' && gate.mode === 'registry' ? gate.address : '',
  );
  const picked = gate.mode === 'registry' ? gate.address : undefined;
  const pick = (address: Address, label: string) => onChange({ mode: 'registry', address, label });

  return (
    <Modal title="Who may join" onClose={onClose} wide>
      <Tabs
        active={tab}
        onSelect={setTab}
        tabs={[
          { id: 'everyone', label: 'Everyone', current: currentTab === 'everyone' },
          { id: 'allowlists', label: 'Allowlists', current: currentTab === 'allowlists' },
          { id: 'circles', label: 'Circles', current: currentTab === 'circles' },
          { id: 'custom', label: 'Custom registry', current: currentTab === 'custom' },
        ]}
      />

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'everyone'}>
        <div className="pick-list">
          <PickRow
            kind="Open"
            label="anyone may join"
            chosen={gate.mode === 'open'}
            onChoose={() => onChange({ mode: 'open' })}
          />
        </div>
        <p className="composer-hint">No registry is asked on joining, so anyone holding the deposit can take part.</p>
      </div>

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'allowlists'}>
        {access ? (
          <AllowlistPanel access={access} picked={picked} onPick={pick} />
        ) : (
          <p className="composer-hint">Registries need a deployment to read them from.</p>
        )}
      </div>

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'circles'}>
        {access ? (
          <CirclesPanel access={access} preset={circlesRegistry} picked={picked} onPick={pick} />
        ) : (
          <p className="composer-hint">Registries need a deployment to read them from.</p>
        )}
      </div>

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'custom'}>
        <label className="duration-field">
          <span className="duration-label">Registry address</span>
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
              const [address] = parseAddressList(next).addresses;
              if (address) pick(address, `members of ${shortAddress(address)}`);
            }}
          />
          <span className="duration-hint">
            Any identity registry by address, including one this app did not make. The same registry can serve any
            number of debates, and it is asked on each join - so an account removed later cannot join, while debates it
            already joined are unaffected.
          </span>
        </label>
        {customAddress !== '' && !looksLikeAddress(customAddress) && <p className="action-error">Not an address.</p>}
      </div>
    </Modal>
  );
}
