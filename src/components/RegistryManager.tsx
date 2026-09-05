import { useEffect, useMemo, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { RegistryAccess } from '../data/registries';
import { useRegistries } from '../data/registries';
import type { IdentityRegistryInfo } from '../data/source';
import { parseAddressList, shortAddress } from '../lib/address';
import { circlesAvatarOf, searchCirclesAvatars, type CirclesAvatar } from '../lib/circles';
import { AddressBadge } from './AddressBadge';

/** Why the manager is showing lists but offering no way to add to them. */
const NEEDS_WALLET = 'Making a registry needs a connected wallet on a network that has a registry factory.';

/** How a Circles registry reads, given what Circles calls its anchor. */
function circlesRegistryLabel(registry: IdentityRegistryInfo, anchorName?: string): string {
  const anchor = registry.anchor ?? zeroAddress;
  if (anchor === zeroAddress) {
    return 'every Circles human';
  }
  const who = anchorName ?? shortAddress(anchor);
  return registry.requireHuman ? `Circles humans that ${who} trusts` : `accounts that ${who} trusts`;
}

/**
 * A registry from an older factory still works, because a clone keeps the code it was cloned
 * against. It stays on offer, after the current factory's and marked.
 */
const fromOlderFactory = (registry: IdentityRegistryInfo, factory?: Address) =>
  factory !== undefined && registry.factory.toLowerCase() !== factory.toLowerCase();

const currentFactoryFirst = (registries: IdentityRegistryInfo[], factory?: Address) =>
  [...registries].sort((a, b) => Number(fromOlderFactory(a, factory)) - Number(fromOlderFactory(b, factory)));

/** One registry or avatar on a list: what kind it is, what it admits, and where to find it. */
function Row({
  kind,
  label,
  note,
  chosen,
  onChoose,
}: {
  kind: string;
  label: string;
  note?: string;
  chosen?: boolean;
  /** Absent where the row is only telling the reader something. */
  onChoose?: () => void;
}) {
  const body = (
    <>
      <span className="registry-kind">{kind}</span>
      <span>{label}</span>
      {note && <span className="registry-note">{note}</span>}
    </>
  );
  return onChoose ? (
    <button type="button" className={`registry-item ${chosen ? 'registry-item-active' : ''}`} onClick={onChoose}>
      {body}
    </button>
  ) : (
    <div className="registry-item registry-item-static">{body}</div>
  );
}

/**
 * The allowlists this account keeps, and who is on the one it is looking at.
 *
 * Accounts arrive as a list rather than one at a time. A list is how they exist elsewhere - a
 * spreadsheet column, a message, another app's export - and adding thirty of them through a
 * single field is thirty transactions where the contract takes one.
 */
function AllowlistPanel({
  access,
  picked,
  onPick,
}: {
  access: RegistryAccess;
  picked?: Address;
  onPick?: (registry: IdentityRegistryInfo, label: string) => void;
}) {
  const { loadMembers, setMembership, createAllowlist, factory } = access;
  const allowlists = useMemo(
    () =>
      currentFactoryFirst(
        access.registries.filter((registry) => registry.kind === 'allowlist'),
        factory,
      ),
    [access.registries, factory],
  );

  const [selected, setSelected] = useState<Address | null>(null);
  // The list being looked at: the reader's choice while it still exists, else the one they named
  // for the debate, else the first. Derived, so a reload cannot leave it pointing at nothing.
  const current =
    [selected, picked].find((address) => allowlists.some((registry) => registry.address === address)) ??
    allowlists[0]?.address ??
    null;

  const [members, setMembers] = useState<Address[] | null>(null);
  const [checked, setChecked] = useState<Address[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current === null) return;
    let stale = false;
    setMembers(null);
    setChecked([]);
    loadMembers(current)
      .then((loaded) => {
        if (!stale) setMembers(loaded);
      })
      .catch((cause) => {
        if (!stale) setError(actionErrorMessage(cause));
      });
    return () => {
      stale = true;
    };
  }, [current, loadMembers]);

  // Circles names for the members, resolved once each; a member Circles does not know keeps its address.
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const unknown = (members ?? []).filter((member) => names[member] === undefined);
    if (unknown.length === 0) return;
    const controller = new AbortController();
    void Promise.all(unknown.map(async (member) => [member, await circlesAvatarOf(member, controller.signal)] as const))
      .then((found) => {
        setNames((known) => ({
          ...known,
          ...Object.fromEntries(found.map(([member, avatar]) => [member, avatar?.name ?? ''])),
        }));
      })
      .catch(() => {
        // Names are a courtesy; the addresses stay legible without them.
      });
    return () => controller.abort();
  }, [members, names]);

  const change = async (accounts: Address[], member: boolean) => {
    if (current === null || !setMembership) return;
    setBusy(true);
    setError(null);
    try {
      await setMembership(current, accounts, member);
      setMembers(await loadMembers(current));
      setChecked([]);
      if (member) setDraft('');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!createAllowlist) return;
    setCreating(true);
    setError(null);
    try {
      const address = await createAllowlist();
      setSelected(address);
      onPick?.({ address, kind: 'allowlist', factory: factory ?? address }, 'your allowlist');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setCreating(false);
    }
  };

  const pasted = parseAddressList(draft);

  return (
    <>
      {allowlists.length === 0 ? (
        <p className="composer-hint">
          You keep no allowlist yet. One list can admit accounts to any number of debates, and you can change who is on
          it at any time.
        </p>
      ) : (
        <div className="registry-list">
          {allowlists.map((registry) => (
            <Row
              key={registry.address}
              kind="Allowlist"
              label={shortAddress(registry.address)}
              note={fromOlderFactory(registry, factory) ? 'older factory' : undefined}
              chosen={registry.address === current}
              onChoose={() => {
                setSelected(registry.address);
                onPick?.(registry, 'your allowlist');
              }}
            />
          ))}
        </div>
      )}

      {createAllowlist ? (
        <button type="button" className="btn btn-small" disabled={creating} onClick={() => void create()}>
          {creating ? 'Creating…' : 'New allowlist'}
        </button>
      ) : (
        <p className="composer-hint">{NEEDS_WALLET}</p>
      )}

      {current !== null && (
        <>
          <p className="member-head">
            {members === null
              ? 'Loading the list…'
              : members.length === 0
                ? 'Nobody on this list yet.'
                : `${members.length} ${members.length === 1 ? 'account' : 'accounts'} on this list`}
            {setMembership && checked.length > 0 && (
              <button
                type="button"
                className="btn btn-small member-remove"
                disabled={busy}
                onClick={() => void change(checked, false)}
              >
                {busy ? 'Removing…' : `Remove ${checked.length}`}
              </button>
            )}
          </p>

          {members !== null && members.length > 0 && (
            <ul className="member-list">
              {members.map((member) => (
                <li key={member} className="member-row">
                  <label className="member-pick">
                    <input
                      type="checkbox"
                      checked={checked.includes(member)}
                      disabled={!setMembership}
                      onChange={(event) =>
                        setChecked((chosen) =>
                          event.target.checked ? [...chosen, member] : chosen.filter((one) => one !== member),
                        )
                      }
                    />
                    <AddressBadge address={member} />
                  </label>
                  {names[member] && <span className="member-name">{names[member]}</span>}
                </li>
              ))}
            </ul>
          )}

          {setMembership && (
            <label className="duration-field">
              <span className="duration-label">Add accounts</span>
              <textarea
                className="address-input"
                rows={3}
                spellCheck={false}
                placeholder="0x… one per line"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <span className="duration-hint">
                Paste as many as you like. New lines, commas and spaces all separate one from the next. An account on
                the list may join every debate that names it. Removing one bars it from joining afterwards, and leaves
                the debates it already joined alone.
              </span>
            </label>
          )}

          {pasted.rejected.length > 0 && (
            <p className="action-error">Not an address: {pasted.rejected.slice(0, 3).join(', ')}</p>
          )}

          {setMembership && pasted.addresses.length > 0 && (
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => void change(pasted.addresses, true)}
            >
              {busy ? 'Adding…' : `Add ${pasted.addresses.length}`}
            </button>
          )}
        </>
      )}

      {error && <p className="action-error">{error}</p>}
    </>
  );
}

/**
 * The Circles registries on offer, and a new one anchored on an avatar.
 *
 * Circles is a social graph, so a registry over it is named by who its anchor trusts rather than
 * by a list of accounts. The reader searches for that avatar by name, then reads back in one
 * sentence exactly who the registry will admit before making it.
 */
function CirclesPanel({
  access,
  preset,
  picked,
  onPick,
}: {
  access: RegistryAccess;
  /** The deployment's own any-Circles-human registry, which the gate already offers as a preset. */
  preset?: Address;
  picked?: Address;
  onPick?: (registry: IdentityRegistryInfo, label: string) => void;
}) {
  const { createCircles, factory } = access;
  const registries = useMemo(
    () =>
      currentFactoryFirst(
        access.registries.filter(
          (registry) => registry.kind === 'circles' && registry.address.toLowerCase() !== preset?.toLowerCase(),
        ),
        factory,
      ),
    [access.registries, factory, preset],
  );

  // The names Circles gives the anchors on the list, resolved once per anchor.
  const [anchorNames, setAnchorNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const anchors = registries
      .map((registry) => registry.anchor)
      .filter((anchor): anchor is Address => anchor !== undefined && anchor !== zeroAddress);
    if (anchors.length === 0) return;
    const controller = new AbortController();
    void Promise.all(anchors.map(async (anchor) => [anchor, await circlesAvatarOf(anchor, controller.signal)] as const))
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
  const [found, setFound] = useState<CirclesAvatar[] | null>(null);
  const [anchor, setAnchor] = useState<CirclesAvatar | null>(null);
  const [requireHuman, setRequireHuman] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim() === '') {
      setFound(null);
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

  const admits = anchor
    ? requireHuman
      ? `Circles humans that ${anchor.name} trusts`
      : `accounts that ${anchor.name} trusts`
    : '';

  const create = async () => {
    if (!createCircles || !anchor) return;
    setBusy(true);
    setError(null);
    try {
      const address = await createCircles(anchor.address, requireHuman);
      onPick?.(
        {
          address,
          kind: 'circles',
          factory: factory ?? address,
          anchor: anchor.address,
          requireHuman,
        },
        admits,
      );
      setAnchor(null);
      setQuery('');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {registries.length > 0 && (
        <div className="registry-list">
          {registries.map((registry) => {
            const label = circlesRegistryLabel(registry, registry.anchor && anchorNames[registry.anchor]);
            return (
              <Row
                key={registry.address}
                kind="Circles"
                label={label}
                note={`${shortAddress(registry.address)}${fromOlderFactory(registry, factory) ? ', older factory' : ''}`}
                chosen={registry.address === picked}
                onChoose={onPick ? () => onPick(registry, label) : undefined}
              />
            );
          })}
        </div>
      )}

      <p className="composer-hint">
        A Circles registry admits accounts by what Circles already knows about them. Anchor one on an avatar to admit
        the accounts that avatar trusts.
      </p>

      <label className="duration-field">
        <span className="duration-label">Anchor</span>
        <input
          type="search"
          className="text-input"
          spellCheck={false}
          placeholder="Search Circles by name"
          value={anchor ? anchor.name : query}
          onChange={(event) => {
            setAnchor(null);
            setQuery(event.target.value);
          }}
        />
      </label>

      {anchor === null && found !== null && (
        <div className="registry-list registry-list-scroll">
          {found.length === 0 ? (
            <p className="composer-hint">No Circles avatar goes by that name.</p>
          ) : (
            found.map((avatar) => (
              <Row
                key={avatar.address}
                kind={avatar.kind}
                label={avatar.name}
                note={shortAddress(avatar.address)}
                onChoose={() => setAnchor(avatar)}
              />
            ))
          )}
        </div>
      )}

      {anchor && (
        <>
          <div className="preset-row">
            <button
              type="button"
              className={`btn btn-small ${requireHuman ? 'preset-active' : ''}`}
              onClick={() => setRequireHuman(true)}
            >
              Humans it trusts
            </button>
            <button
              type="button"
              className={`btn btn-small ${requireHuman ? '' : 'preset-active'}`}
              onClick={() => setRequireHuman(false)}
            >
              Anyone it trusts
            </button>
          </div>
          <p className="composer-hint">Admits {admits}.</p>
          {createCircles ? (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void create()}>
              {busy ? 'Creating…' : 'Create registry'}
            </button>
          ) : (
            <p className="composer-hint">{NEEDS_WALLET}</p>
          )}
        </>
      )}

      {error && <p className="action-error">{error}</p>}
    </>
  );
}

/**
 * The one place identity registries are read and kept: the allowlists this account owns, and the
 * Circles registries anyone can use. Two kinds with nothing in common but the question they answer
 * - a list you write yourself, and a graph somebody else already keeps - so they sit on separate
 * tabs rather than in one column where the search field for one reads as part of the other.
 *
 * The wallet menu opens it to keep registries. The join settings embed it to choose one, and there
 * choosing is what selecting a row does, the way every other setting in this app applies live
 * (principle 6).
 */
export function RegistryManager({
  circlesPreset,
  picked,
  onPick,
}: {
  circlesPreset?: Address;
  /** The registry a debate names, where this manager is choosing one. */
  picked?: Address;
  /** Choosing a registry. Absent where the manager is only for keeping them. */
  onPick?: (registry: IdentityRegistryInfo, label: string) => void;
}) {
  const access = useRegistries();
  const [tab, setTab] = useState<'allowlists' | 'circles'>('allowlists');

  if (!access) {
    return <p className="composer-hint">Registries need a deployment to read them from.</p>;
  }

  return (
    <>
      <div className="tab-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'allowlists'}
          className={`tab ${tab === 'allowlists' ? 'tab-active' : ''}`}
          onClick={() => setTab('allowlists')}
        >
          Allowlists
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'circles'}
          className={`tab ${tab === 'circles' ? 'tab-active' : ''}`}
          onClick={() => setTab('circles')}
        >
          Circles
        </button>
      </div>

      {tab === 'allowlists' ? (
        <AllowlistPanel access={access} picked={picked} onPick={onPick} />
      ) : (
        <CirclesPanel access={access} preset={circlesPreset} picked={picked} onPick={onPick} />
      )}
    </>
  );
}
