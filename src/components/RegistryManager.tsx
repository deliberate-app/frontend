import { useEffect, useMemo, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { RegistryAccess } from '../data/registries';
import { useRegistries } from '../data/registries';
import type { IdentityRegistryInfo } from '../data/source';
import { looksLikeAddress, parseAddressList, shortAddress, writeAddressRow } from '../lib/address';
import { searchCirclesAvatars, useCirclesNames, type CirclesAvatar } from '../lib/circles';
import { AddressBadge } from './AddressBadge';
import { PickRow, Segmented, Tabs } from './Choice';

/** Why the manager is showing lists but offering no way to add to them. */
const NEEDS_WALLET = 'Making a registry needs a connected wallet on a network that has a registry factory.';

/** Who a Circles registry admits, in the words the app uses for it everywhere. */
const admits = (requireHuman: boolean, who: string) =>
  requireHuman ? `Circles humans that ${who} trusts` : `accounts that ${who} trusts`;

/** How a Circles registry reads, given what Circles calls its anchor. */
function circlesRegistryLabel(registry: IdentityRegistryInfo, anchorName?: string): string {
  const anchor = registry.anchor ?? zeroAddress;
  return anchor === zeroAddress
    ? 'every Circles human'
    : admits(registry.requireHuman ?? false, anchorName ?? shortAddress(anchor));
}

/**
 * A registry from an older factory still works, because a clone keeps the code it was cloned
 * against. It stays on offer, after the current factory's and marked.
 */
const fromOlderFactory = (registry: IdentityRegistryInfo, factory?: Address) =>
  factory !== undefined && registry.factory.toLowerCase() !== factory.toLowerCase();

const currentFactoryFirst = (registries: IdentityRegistryInfo[], factory?: Address) =>
  [...registries].sort((a, b) => Number(fromOlderFactory(a, factory)) - Number(fromOlderFactory(b, factory)));

/**
 * How one row of the account list reads: empty rows are the dashed invitation to write the next
 * account (principle 4), and a row that is not an address says so on its own edge.
 */
const addressRowMark = (row: string) =>
  row.trim() === '' ? ' address-row-empty' : looksLikeAddress(row) ? '' : ' address-row-invalid';

/** An address as it reads on a row: the app's one truncation, in the app's one address face. */
const mono = (address: Address) => <span className="mono">{shortAddress(address)}</span>;

/**
 * The allowlists this account keeps, and who is on the one it is looking at.
 *
 * Accounts arrive as a list rather than one at a time. A list is how they exist elsewhere - a
 * spreadsheet column, a message, another app's export - and adding thirty of them through a single
 * field is thirty transactions where the contract takes one.
 */
export function AllowlistPanel({
  access: { registries, factory, loadMembers, setMembership, createAllowlist },
  picked,
  onPick,
}: {
  access: RegistryAccess;
  picked?: Address;
  onPick?: (registry: Address, label: string) => void;
}) {
  const allowlists = useMemo(
    () =>
      currentFactoryFirst(
        registries.filter((registry) => registry.kind === 'allowlist'),
        factory,
      ),
    [registries, factory],
  );

  const [selected, setSelected] = useState<Address | null>(null);
  // The list whose members are shown: the one the reader opened while it still exists, else the one
  // the debate names, else the first. Derived, so a reload cannot leave it pointing at nothing.
  const holds = (address?: Address | null) => allowlists.some((registry) => registry.address === address);
  const current = (holds(selected) ? selected : holds(picked) ? picked : allowlists[0]?.address) ?? null;

  const [members, setMembers] = useState<Address[] | null>(null);
  const [checked, setChecked] = useState<Address[]>([]);
  const [rows, setRows] = useState<string[]>(['']);
  const [busy, setBusy] = useState<'creating' | 'adding' | 'removing' | null>(null);
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

  const names = useCirclesNames(members ?? []);
  const pasted = useMemo(() => parseAddressList(rows.join(' ')), [rows]);

  const change = async (accounts: Address[], member: boolean) => {
    if (current === null || !setMembership) return;
    setBusy(member ? 'adding' : 'removing');
    setError(null);
    try {
      await setMembership(current, accounts, member);
      setMembers(await loadMembers(current));
      setChecked([]);
      if (member) setRows(['']);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!createAllowlist) return;
    setBusy('creating');
    setError(null);
    try {
      const address = await createAllowlist();
      setSelected(address);
      onPick?.(address, 'your allowlist');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {allowlists.length === 0 ? (
        <p className="composer-hint">
          You keep no allowlist yet. One list can admit accounts to any number of debates, and you can change who is on
          it at any time.
        </p>
      ) : (
        <div className="pick-list">
          {allowlists.map((registry) => (
            <PickRow
              key={registry.address}
              kind="Allowlist"
              label={mono(registry.address)}
              note={fromOlderFactory(registry, factory) ? 'older factory' : undefined}
              chosen={registry.address === picked}
              current={registry.address === current}
              onChoose={() => {
                setSelected(registry.address);
                onPick?.(registry.address, 'your allowlist');
              }}
            />
          ))}
        </div>
      )}

      {createAllowlist ? (
        <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => void create()}>
          {busy === 'creating' ? 'Creating…' : 'New allowlist'}
        </button>
      ) : (
        <p className="composer-hint">{NEEDS_WALLET}</p>
      )}

      {current !== null && (
        <>
          <p className="member-row member-head">
            {members === null
              ? 'Loading the list…'
              : members.length === 0
                ? 'Nobody on this list yet.'
                : `${members.length} ${members.length === 1 ? 'account' : 'accounts'} on this list`}
            {checked.length > 0 && (
              <button
                type="button"
                className="btn btn-small member-remove"
                disabled={busy !== null}
                onClick={() => void change(checked, false)}
              >
                {busy === 'removing' ? 'Removing…' : `Remove ${checked.length}`}
              </button>
            )}
          </p>

          {members !== null && members.length > 0 && (
            <ul className="member-list">
              {members.map((member) => (
                <li key={member} className="member-row">
                  {setMembership ? (
                    <label className="member-pick">
                      <input
                        type="checkbox"
                        checked={checked.includes(member)}
                        onChange={(event) =>
                          setChecked((chosen) =>
                            event.target.checked ? [...chosen, member] : chosen.filter((one) => one !== member),
                          )
                        }
                      />
                      <AddressBadge address={member} />
                    </label>
                  ) : (
                    <AddressBadge address={member} />
                  )}
                  {names[member] && <span className="member-name">{names[member]}</span>}
                </li>
              ))}
            </ul>
          )}

          {setMembership && (
            <>
              <div className="duration-field">
                <span className="duration-label">Add accounts</span>
                <div className="address-rows">
                  {rows.map((row, index) => (
                    <input
                      // Rows are addressed by position: a paste inserts several at once, and the
                      // value each input shows comes from the state rather than from the element.
                      key={index}
                      type="text"
                      className={`text-input address-row${addressRowMark(row)}`}
                      spellCheck={false}
                      placeholder="0x…"
                      value={row}
                      onChange={(event) => setRows((current) => writeAddressRow(current, index, event.target.value))}
                    />
                  ))}
                </div>
                <span className="duration-hint">
                  One account per row. Paste a list into any row and it spreads over a row each. An account on the list
                  may join every debate that names it. Removing one bars it from joining afterwards, and leaves the
                  debates it already joined alone.
                </span>
              </div>

              {pasted.addresses.length > 0 && (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy !== null}
                  onClick={() => void change(pasted.addresses, true)}
                >
                  {busy === 'adding' ? 'Adding…' : `Add ${pasted.addresses.length}`}
                </button>
              )}
            </>
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
 * Circles is a social graph, so a registry over it is named by who its anchor trusts rather than by
 * a list of accounts. The reader searches for that avatar by name, then reads back in one sentence
 * exactly who the registry will admit before making it.
 */
export function CirclesPanel({
  access: { registries, factory, createCircles },
  preset,
  picked,
  onPick,
}: {
  access: RegistryAccess;
  /** The deployment's own any-Circles-human registry, which the gate already offers as a preset. */
  preset?: Address;
  picked?: Address;
  onPick?: (registry: Address, label: string) => void;
}) {
  const anchored = useMemo(
    () =>
      currentFactoryFirst(
        registries.filter(
          (registry) => registry.kind === 'circles' && registry.address.toLowerCase() !== preset?.toLowerCase(),
        ),
        factory,
      ),
    [registries, factory, preset],
  );

  const anchors = useMemo(
    () =>
      anchored
        .map((registry) => registry.anchor)
        .filter((anchor): anchor is Address => anchor !== undefined && anchor !== zeroAddress),
    [anchored],
  );
  const anchorNames = useCirclesNames(anchors);

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

  const create = async () => {
    if (!createCircles || !anchor) return;
    setBusy(true);
    setError(null);
    try {
      onPick?.(await createCircles(anchor.address, requireHuman), admits(requireHuman, anchor.name));
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
      {(preset || anchored.length > 0) && (
        <div className="pick-list">
          {preset && (
            <PickRow
              kind="Circles"
              label="every Circles human"
              note={mono(preset)}
              chosen={preset === picked}
              onChoose={onPick ? () => onPick(preset, 'Circles humans') : undefined}
            />
          )}
          {anchored.map((registry) => {
            const label = circlesRegistryLabel(registry, registry.anchor && anchorNames[registry.anchor]);
            return (
              <PickRow
                key={registry.address}
                kind="Circles"
                label={label}
                note={
                  <>
                    {mono(registry.address)}
                    {fromOlderFactory(registry, factory) && ', older factory'}
                  </>
                }
                chosen={registry.address === picked}
                onChoose={onPick ? () => onPick(registry.address, label) : undefined}
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
        <div className="pick-list pick-list-scroll">
          {found.length === 0 ? (
            <p className="composer-hint">No Circles avatar goes by that name.</p>
          ) : (
            found.map((avatar) => (
              <PickRow
                key={avatar.address}
                kind={avatar.kind}
                label={avatar.name}
                note={mono(avatar.address)}
                onChoose={() => setAnchor(avatar)}
              />
            ))
          )}
        </div>
      )}

      {anchor && (
        <>
          <Segmented
            label="Who the anchor's trust admits"
            value={requireHuman ? 'humans' : 'anyone'}
            onChange={(who) => setRequireHuman(who === 'humans')}
            options={[
              { id: 'humans', label: 'Humans it trusts' },
              { id: 'anyone', label: 'Anyone it trusts' },
            ]}
          />
          <p className="composer-hint">Admits {admits(requireHuman, anchor.name)}.</p>
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
 * (principle 6). Both panels stay mounted, so flipping tabs does not throw away a half-typed paste.
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
  onPick?: (registry: Address, label: string) => void;
}) {
  const access = useRegistries();
  const [tab, setTab] = useState<'allowlists' | 'circles'>('allowlists');

  if (!access) {
    return <p className="composer-hint">Registries need a deployment to read them from.</p>;
  }

  return (
    <>
      <Tabs
        active={tab}
        onSelect={setTab}
        tabs={[
          { id: 'allowlists', label: 'Allowlists' },
          { id: 'circles', label: 'Circles' },
        ]}
      />

      <div className="tab-panel" role="tabpanel" hidden={tab !== 'allowlists'}>
        <AllowlistPanel access={access} picked={picked} onPick={onPick} />
      </div>
      <div className="tab-panel" role="tabpanel" hidden={tab !== 'circles'}>
        <CirclesPanel access={access} preset={circlesPreset} picked={picked} onPick={onPick} />
      </div>
    </>
  );
}
