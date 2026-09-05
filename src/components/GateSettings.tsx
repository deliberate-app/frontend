import { useMemo, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import { useRegistries } from '../data/registries';
import { looksLikeAddress, parseAddressList, shortAddress } from '../lib/address';
import { useCirclesNames } from '../lib/circles';
import { useRegistryNames } from '../lib/registryNames';
import { PickRow, Tabs } from './Choice';
import { Modal } from './Modal';
import { circlesRegistryLabel, RegistryManager } from './RegistryManager';

/**
 * Who may join a debate, as chosen before creation. Two shapes, both expressed to the contract as
 * one registry address: the zero address for an open debate, and any `IIdentityRegistry` by
 * address. A registry picked here carries the name it was picked by, so the chip can say it.
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
 * The participants step: who the registry will admit when someone tries to join.
 *
 * One tab per kind of answer. "Everyone" needs nothing further, so opening it is the answer; the
 * other three list what exists and are answered by picking a row or writing an address. Making and
 * keeping registries is a different question, so each list links to the manager rather than
 * carrying its controls.
 */
export function ParticipantFields({
  gate,
  onChange,
  circlesRegistry,
}: {
  gate: GateDraft;
  onChange: (gate: GateDraft) => void;
  /** The deployment's Circles preset registry. */
  circlesRegistry: Address;
}) {
  const access = useRegistries();
  const registries = access?.registries ?? [];
  const names = useRegistryNames();

  const allowlists = registries.filter((registry) => registry.kind === 'allowlist');
  const circles = registries.filter((registry) => registry.kind === 'circles');
  const anchorNames = useCirclesNames(
    useMemo(
      () =>
        circles
          .map((registry) => registry.anchor)
          .filter((anchor): anchor is Address => anchor !== undefined && anchor !== zeroAddress),
      // The addresses matter, not the array the filter above builds on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [registries],
    ),
  );

  // The tab the debate's current choice lives in, which is where the modal opens.
  const held = registries.find(
    (registry) => gate.mode === 'registry' && registry.address.toLowerCase() === gate.address.toLowerCase(),
  );
  const [tab, setTab] = useState<GateTab>(
    gate.mode === 'open' ? 'everyone' : held ? (held.kind === 'allowlist' ? 'allowlists' : 'circles') : 'custom',
  );
  const [managing, setManaging] = useState(false);
  const [customAddress, setCustomAddress] = useState(gate.mode === 'registry' && !held ? gate.address : '');

  const picked = gate.mode === 'registry' ? gate.address : undefined;
  const pick = (address: Address, label: string) => onChange({ mode: 'registry', address, label });

  const manage = (
    <button type="button" className="btn btn-small" onClick={() => setManaging(true)}>
      Manage registries
    </button>
  );

  return (
    <>
      <Tabs
        active={tab}
        onSelect={(next) => {
          setTab(next);
          // Everyone is the whole answer, so opening it settles the question.
          if (next === 'everyone') onChange({ mode: 'open' });
        }}
        tabs={[
          { id: 'everyone', label: 'Everyone' },
          { id: 'allowlists', label: 'Allowlists' },
          { id: 'circles', label: 'Circles' },
          { id: 'custom', label: 'Custom' },
        ]}
      />

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'everyone'}>
        <p className="composer-hint">Anyone may join.</p>
      </div>

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'allowlists'}>
        {allowlists.length === 0 ? (
          <p className="composer-hint">No allowlists yet.</p>
        ) : (
          <div className="pick-list">
            {allowlists.map((registry) => (
              <PickRow
                key={registry.address}
                kind="Allowlist"
                label={names[registry.address.toLowerCase()] ?? 'Unnamed'}
                sub={<span className="mono address-full">{registry.address}</span>}
                chosen={registry.address === picked}
                onChoose={() => pick(registry.address, names[registry.address.toLowerCase()] ?? 'your allowlist')}
              />
            ))}
          </div>
        )}
        {manage}
      </div>

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'circles'}>
        {circles.length === 0 ? (
          <p className="composer-hint">No Circles registries yet.</p>
        ) : (
          <div className="pick-list">
            {circles.map((registry) => {
              const label = circlesRegistryLabel(registry, registry.anchor && anchorNames[registry.anchor]);
              return (
                <PickRow
                  key={registry.address}
                  kind="Circles"
                  label={label}
                  note={registry.address.toLowerCase() === circlesRegistry.toLowerCase() ? 'this network' : undefined}
                  sub={<span className="mono address-full">{registry.address}</span>}
                  chosen={registry.address === picked}
                  onChoose={() => pick(registry.address, label)}
                />
              );
            })}
          </div>
        )}
        {manage}
      </div>

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'custom'}>
        <label className="duration-field">
          <span className="duration-label">Registry address</span>
          <input
            type="text"
            className="text-input mono"
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
          <span className="duration-hint">Any identity registry, by address.</span>
        </label>
        {customAddress !== '' && !looksLikeAddress(customAddress) && <p className="action-error">Not an address.</p>}
      </div>

      {managing && (
        <Modal title="Registries" onClose={() => setManaging(false)} wide>
          <RegistryManager />
        </Modal>
      )}
    </>
  );
}
