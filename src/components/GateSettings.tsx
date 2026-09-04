import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { isAddress, zeroAddress, type Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { IdentityRegistryInfo } from '../data/source';
import { shortAddress } from '../lib/address';
import { circlesAvatarOf, searchCirclesAvatars, type CirclesAvatar } from '../lib/circles';

/**
 * Who may join a debate, as chosen before creation. Three shapes, all expressed to the contract as one
 * registry address: the zero address for an open debate, any `IIdentityRegistry` by address, and the
 * deployment's Circles preset - a registry admitting any Circles human. A registry picked or made here
 * carries the name it was picked by, so the chip can say it.
 */
export type GateDraft =
  | { mode: 'open' }
  | { mode: 'circles'; address: Address }
  | { mode: 'registry'; address: Address; label?: string };

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

/** How a Circles registry reads, given what Circles calls its anchor. */
function circlesRegistryLabel(registry: IdentityRegistryInfo, anchorName?: string): string {
  const anchor = registry.anchor ?? zeroAddress;
  if (anchor === zeroAddress) {
    return 'every Circles human';
  }
  const who = anchorName ?? shortAddress(anchor);
  return registry.requireHuman ? `Circles humans ${who} trusts` : `accounts ${who} trusts`;
}

/**
 * The cogwheel modal choosing a debate's join gate before creation. Edits apply live, like the other
 * settings modals: the chip behind it updates as the choice changes, and closing is the only exit.
 *
 * A creator picks from what exists - the allowlists they own and the Circles registries the factory
 * has made - or makes a new one here: an allowlist they will keep, or a Circles registry anchored on
 * an avatar found by name. Making one is a transaction, so it needs a wallet and a factory.
 */
export function GateSettings({
  gate,
  onChange,
  onClose,
  circlesRegistry,
  registries,
  currentFactory,
  canCreate,
  onCreateAllowlist,
  onCreateCirclesRegistry,
}: {
  gate: GateDraft;
  onChange: (gate: GateDraft) => void;
  onClose: () => void;
  /** The deployment's Circles preset registry. */
  circlesRegistry: Address;
  /** The registries the index knows: the creator's allowlists and every Circles registry. */
  registries: IdentityRegistryInfo[];
  /** The network's current factory. Factories are immutable and superseded, so registries from an older one are marked. */
  currentFactory?: Address;
  /** Whether a new registry can be made here - a wallet is connected and the network has a factory. */
  canCreate: boolean;
  onCreateAllowlist: () => Promise<Address>;
  onCreateCirclesRegistry: (anchor: Address, requireHuman: boolean) => Promise<Address>;
}) {
  const [customAddress, setCustomAddress] = useState(gate.mode === 'registry' ? gate.address : '');
  const customValid = isAddress(customAddress);

  // The names Circles gives the anchors on the list, resolved once per anchor.
  const [anchorNames, setAnchorNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const anchors = registries
      .map((registry) => registry.anchor)
      .filter((anchor): anchor is Address => anchor !== undefined && anchor !== zeroAddress);
    if (anchors.length === 0) return;
    const controller = new AbortController();
    void Promise.all(
      anchors.map(async (anchor) => [anchor, await circlesAvatarOf(anchor, controller.signal)] as const),
    )
      .then((found) => {
        setAnchorNames(
          Object.fromEntries(found.flatMap(([anchor, avatar]) => (avatar ? [[anchor, avatar.name]] : []))),
        );
      })
      .catch(() => {
        // Names are a courtesy; the addresses stay legible without them.
      });
    return () => controller.abort();
  }, [registries]);

  // Finding an anchor by name: the query is sent a moment after typing stops, and a stale answer is
  // dropped when the query has moved on.
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<CirclesAvatar[]>([]);
  const [anchor, setAnchor] = useState<CirclesAvatar | null>(null);
  const [requireHuman, setRequireHuman] = useState(true);
  useEffect(() => {
    if (query.trim() === '') {
      setFound([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchCirclesAvatars(query, controller.signal)
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const [busy, setBusy] = useState<'allowlist' | 'circles' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async (kind: 'allowlist' | 'circles', make: () => Promise<Address>, label: string) => {
    setBusy(kind);
    setError(null);
    try {
      onChange({ mode: 'registry', address: await make(), label });
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  // A registry from an older factory still works - a clone keeps the code it was cloned against - so it
  // stays on offer, after the current factory's and marked as older.
  const fromOlderFactory = (registry: IdentityRegistryInfo) =>
    currentFactory !== undefined && registry.factory.toLowerCase() !== currentFactory.toLowerCase();
  const currentFirst = (a: IdentityRegistryInfo, b: IdentityRegistryInfo) =>
    Number(fromOlderFactory(a)) - Number(fromOlderFactory(b));
  const allowlists = registries.filter((registry) => registry.kind === 'allowlist').sort(currentFirst);
  // The preset already stands for the deployment's own any-human registry.
  const circles = registries
    .filter((registry) => registry.kind === 'circles' && registry.address.toLowerCase() !== circlesRegistry.toLowerCase())
    .sort(currentFirst);
  const chosen = (address: Address) => gate.mode === 'registry' && gate.address === address;

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

      {(allowlists.length > 0 || circles.length > 0) && (
        <div className="registry-list">
          {allowlists.map((registry) => (
            <button
              key={registry.address}
              type="button"
              className={`registry-item ${chosen(registry.address) ? 'registry-item-active' : ''}`}
              onClick={() =>
                onChange({ mode: 'registry', address: registry.address, label: 'your allowlist' })
              }
            >
              <span className="registry-kind">Allowlist</span>
              <span className="mono">{shortAddress(registry.address)}</span>
              <span className="registry-note">
                {fromOlderFactory(registry) ? 'you keep the list, older factory' : 'you keep the list'}
              </span>
            </button>
          ))}
          {circles.map((registry) => {
            const label = circlesRegistryLabel(registry, registry.anchor && anchorNames[registry.anchor]);
            return (
              <button
                key={registry.address}
                type="button"
                className={`registry-item ${chosen(registry.address) ? 'registry-item-active' : ''}`}
                onClick={() => onChange({ mode: 'registry', address: registry.address, label })}
              >
                <span className="registry-kind">Circles</span>
                <span>{label}</span>
                <span className="mono registry-note">
                  {shortAddress(registry.address)}
                  {fromOlderFactory(registry) ? ', older factory' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {canCreate && (
        <>
          <div className="preset-row">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy !== null}
              onClick={() => void create('allowlist', onCreateAllowlist, 'your new allowlist')}
            >
              {busy === 'allowlist' ? 'Creating…' : 'New allowlist'}
            </button>
            <span className="duration-hint">A list you keep. Add and remove accounts from your wallet menu.</span>
          </div>

          <label className="duration-field">
            <span className="duration-label">Circles anchor</span>
            <span className="duration-inputs">
              <input
                type="search"
                spellCheck={false}
                placeholder="Find a Circles group or organization by name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
            <span className="duration-hint">
              A new Circles registry admits the accounts this avatar trusts.
            </span>
          </label>
          {found.length > 0 && (
            <div className="registry-list">
              {found.map((avatar) => (
                <button
                  key={avatar.address}
                  type="button"
                  className={`registry-item ${anchor?.address === avatar.address ? 'registry-item-active' : ''}`}
                  onClick={() => setAnchor(avatar)}
                >
                  <span className="registry-kind">{avatar.kind}</span>
                  <span>{avatar.name}</span>
                  <span className="mono registry-note">{shortAddress(avatar.address)}</span>
                </button>
              ))}
            </div>
          )}
          {anchor && (
            <div className="preset-row">
              <label className="registry-check">
                <input
                  type="checkbox"
                  checked={requireHuman}
                  onChange={(event) => setRequireHuman(event.target.checked)}
                />
                only registered humans
              </label>
              <button
                type="button"
                className="btn btn-small"
                disabled={busy !== null}
                onClick={() =>
                  void create(
                    'circles',
                    () => onCreateCirclesRegistry(anchor.address, requireHuman),
                    requireHuman ? `Circles humans ${anchor.name} trusts` : `accounts ${anchor.name} trusts`,
                  )
                }
              >
                {busy === 'circles' ? 'Creating…' : `Create registry anchored on ${anchor.name}`}
              </button>
            </div>
          )}
          {error && <p className="action-error">{error}</p>}
        </>
      )}

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
          Any identity registry by address. The same registry can serve any number of debates, and it is
          asked on each join - so an account removed later cannot join, while debates already joined are
          unaffected.
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
