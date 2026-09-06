import { useState } from 'react';
import { getAddress, zeroAddress, type Address } from 'viem';
import { useRegistries, type RegistryAccess } from '../data/registries';
import { looksLikeAddress, shortAddress } from '../lib/address';
import { useHostedAccount } from '../wallet/hostedAccount';
import { PickRow, Tabs } from './Choice';
import { Modal } from './Modal';
import {
  KIND_WORDS,
  NO_ALLOWLISTS,
  RegistryManager,
  useRegistryRows,
  type RegistryKind,
  type RegistryRow,
} from './RegistryManager';

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

type GateTab = 'everyone' | RegistryKind | 'custom';

/** The open debate, said the same way wherever the reader meets it. */
const ANYONE_MAY_JOIN = 'Anyone may join.';

/**
 * One tab's worth of registries: the rows this deployment offers, and the way to the dialog that
 * keeps them. The rows come from the manager, so what a list is called and which factory made it
 * are settled in one place rather than agreed between two.
 */
function RegistryTab({
  access,
  kind,
  empty,
  picked,
  onPick,
  onManage,
}: {
  access: RegistryAccess;
  kind: RegistryKind;
  /** What to say when this deployment offers none of this kind. */
  empty: string;
  picked?: Address;
  onPick: (row: RegistryRow) => void;
  onManage: () => void;
}) {
  const rows = useRegistryRows(access, kind);
  return (
    <>
      {rows.length === 0 ? (
        <p className="composer-hint">{empty}</p>
      ) : (
        <div className="pick-list">
          {rows.map((row) => (
            <PickRow
              key={row.registry.address}
              kind={row.kind}
              label={row.label}
              note={row.note}
              address={row.registry.address}
              chosen={row.registry.address === picked}
              onChoose={() => onPick(row)}
            />
          ))}
        </div>
      )}
      <button type="button" className="btn btn-small" onClick={onManage}>
        Manage {KIND_WORDS[kind].noun}
      </button>
    </>
  );
}

/**
 * The participants step: who the registry will admit when someone tries to join.
 *
 * One tab per kind of answer. "Everyone" needs nothing further, so opening it is the answer; the
 * other three list what exists and are answered by picking a row or writing an address. Making and
 * keeping registries is a different question, so each list links to the manager rather than
 * carrying its controls.
 */
export function ParticipantFields({ gate, onChange }: { gate: GateDraft; onChange: (gate: GateDraft) => void }) {
  const access = useRegistries();
  const circlesOffered = useHostedAccount();

  // The tab the debate's current choice lives in, which is where the fields open. Read once, for
  // the initial state: after that the reader owns the tab.
  const [tab, setTab] = useState<GateTab>(() => {
    if (gate.mode === 'open') return 'everyone';
    const held = access?.registries.find((registry) => registry.address.toLowerCase() === gate.address.toLowerCase());
    // A debate already gated by a Circles registry opens on Custom where that tab is not offered:
    // the address is still shown, and still the answer, on the one tab that can hold it.
    if (held?.kind === 'circles' && !circlesOffered) return 'custom';
    if (held) return held.kind;
    // The network's own Circles registry, before the index has listed it - the debate opens on the
    // tab that holds it rather than on the one for an address it does not recognise.
    if (circlesOffered && access?.circlesRegistry?.toLowerCase() === gate.address.toLowerCase()) return 'circles';
    return 'custom';
  });
  // Which kind of registry the manager was opened for, and null while it is closed.
  const [managing, setManaging] = useState<RegistryKind | null>(null);
  const [customAddress, setCustomAddress] = useState(() =>
    gate.mode === 'registry' &&
    !access?.registries.some((registry) => registry.address.toLowerCase() === gate.address.toLowerCase())
      ? gate.address
      : '',
  );

  // Nothing to gate a debate with, and nothing to make one from: the question does not arise.
  if (!access) return <p className="composer-hint">{ANYONE_MAY_JOIN}</p>;

  const picked = gate.mode === 'registry' ? gate.address : undefined;
  // The row is picked by its words, so the summary can say what was picked rather than an address.
  const pick = ({ registry, name, label }: RegistryRow) =>
    onChange({
      mode: 'registry',
      address: registry.address,
      label: registry.kind === 'allowlist' ? (name ?? 'your allowlist') : label,
    });

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
          // Circles admits by trust between Circles accounts, so it is offered only where the
          // reader has one - inside the Gnosis App, where it also leads, because there it is the
          // answer a debate starts with.
          ...(circlesOffered ? ([{ id: 'circles', label: 'Circles' }] as const) : []),
          { id: 'everyone', label: 'Everyone' },
          { id: 'allowlist', label: 'Allowlists' },
          { id: 'custom', label: 'Custom' },
        ]}
      />

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'everyone'}>
        <p className="composer-hint">{ANYONE_MAY_JOIN}</p>
      </div>

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'allowlist'}>
        <RegistryTab
          access={access}
          kind="allowlist"
          empty={NO_ALLOWLISTS}
          picked={picked}
          onPick={pick}
          onManage={() => setManaging('allowlist')}
        />
      </div>

      <div className="tab-panel" role="tabpanel" hidden={!circlesOffered || tab !== 'circles'}>
        <RegistryTab
          access={access}
          kind="circles"
          empty="No Circles registries yet."
          picked={picked}
          onPick={pick}
          onManage={() => setManaging('circles')}
        />
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
              // One field, one address, one answer to what an address is - the same one the line
              // below uses to say so when the text is not one.
              if (looksLikeAddress(next)) onChange({ mode: 'registry', address: getAddress(next) });
            }}
          />
          <span className="duration-hint">Any identity registry, by address.</span>
        </label>
        {customAddress !== '' && !looksLikeAddress(customAddress) && <p className="action-error">Not an address.</p>}
      </div>

      {managing && (
        <Modal title={KIND_WORDS[managing].title} onClose={() => setManaging(null)} wide>
          <RegistryManager only={managing} />
        </Modal>
      )}
    </>
  );
}
