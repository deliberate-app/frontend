import { useEffect, useMemo, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { RegistryAccess } from '../data/registries';
import { useRegistries } from '../data/registries';
import type { IdentityRegistryInfo } from '../data/source';
import { shortAddress } from '../lib/address';
import { searchCirclesAvatars, useCirclesNames, type CirclesAvatar } from '../lib/circles';
import { useRegistryNames } from '../lib/registryNames';
import { PickRow, Segmented, Tabs } from './Choice';
import { ModifyAllowlist } from './ModifyAllowlist';

/** What Circles calls an avatar, in the words a reader uses, article and all. */
const KIND_WORD: Record<CirclesAvatar['kind'], string> = {
  human: 'a person',
  group: 'a group',
  organization: 'an organization',
};

/**
 * What a choice of trust rule actually admits, which is the whole decision.
 *
 * Circles trust runs between avatars of every kind, so an avatar that trusts other groups passes
 * that trust on to accounts no person holds. Whether those may join is what this asks, and the
 * answer is easier to see stated as who ends up in the debate.
 */
const ADMITS = {
  people:
    'Only accounts Circles registered as a person. Circles registers people by invitation rather than by an identity check, and a group or organization this avatar trusts cannot join.',
  any: 'Everyone this avatar trusts, groups and organizations included. Each account joins as one participant, however many people stand behind it.',
} as const;

/** The two kinds of registry, which are also the manager's two tabs. */
export type RegistryKind = 'allowlists' | 'circles';

/** Why the manager is showing lists but offering no way to add to them. */
const NEEDS_WALLET = 'Connect a wallet to make one.';

/**
 * Who a Circles registry admits, in the words the app uses for it everywhere.
 *
 * "People" is what Circles registers an avatar as, which is a social graph rather than a proof of
 * personhood, so the option that says so carries the caveat and the label stays plain.
 */
export const admits = (requireHuman: boolean, who: string) =>
  requireHuman ? `the people ${who} trusts` : `anyone ${who} trusts`;

/** How a Circles registry reads, given what Circles calls its anchor. */
export function circlesRegistryLabel(registry: IdentityRegistryInfo, anchorName?: string): string {
  const anchor = registry.anchor ?? zeroAddress;
  return anchor === zeroAddress
    ? 'every person on Circles'
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
 * The allowlists this account keeps. One row each, and one way to make another - who is on a list
 * is a question for that list, answered in `ModifyAllowlist`, so it does not sit between the rows
 * and the button that adds to them.
 */
export function AllowlistPanel({ access }: { access: RegistryAccess }) {
  const { registries, factory, createAllowlist } = access;
  const allowlists = useMemo(
    () =>
      currentFactoryFirst(
        registries.filter((registry) => registry.kind === 'allowlist'),
        factory,
      ),
    [registries, factory],
  );

  const [editing, setEditing] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = useRegistryNames();

  const create = async () => {
    if (!createAllowlist) return;
    setBusy(true);
    setError(null);
    try {
      // Straight into the new list, which is where naming it and filling it happen.
      setEditing(await createAllowlist());
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {allowlists.length === 0 ? (
        <p className="composer-hint">No allowlists yet.</p>
      ) : (
        <div className="pick-list">
          {allowlists.map((registry) => (
            <PickRow
              key={registry.address}
              kind="Allowlist"
              label={names[registry.address.toLowerCase()] ?? 'Unnamed'}
              note={
                <>
                  {fromOlderFactory(registry, factory) && <span className="pick-row-aside">older factory</span>}
                  <span className="btn btn-small">Edit</span>
                </>
              }
              sub={<span className="mono address-full">{registry.address}</span>}
              onChoose={() => setEditing(registry.address)}
            />
          ))}
        </div>
      )}

      {createAllowlist ? (
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void create()}>
          {busy ? 'Creating…' : 'New allowlist'}
        </button>
      ) : (
        <p className="composer-hint">{NEEDS_WALLET}</p>
      )}

      {error && <p className="action-error">{error}</p>}

      {editing && <ModifyAllowlist key={editing} registry={editing} access={access} onClose={() => setEditing(null)} />}
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
export function CirclesPanel({ access: { registries, factory, createCircles } }: { access: RegistryAccess }) {
  const anchored = useMemo(
    () =>
      currentFactoryFirst(
        registries.filter((registry) => registry.kind === 'circles'),
        factory,
      ),
    [registries, factory],
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
      await createCircles(anchor.address, requireHuman);
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
      {anchored.length > 0 && (
        <div className="pick-list">
          {anchored.map((registry) => {
            const label = circlesRegistryLabel(registry, registry.anchor && anchorNames[registry.anchor]);
            return (
              <PickRow
                key={registry.address}
                kind="Circles"
                label={label}
                note={fromOlderFactory(registry, factory) ? 'older factory' : undefined}
                sub={<span className="mono address-full">{registry.address}</span>}
              />
            );
          })}
        </div>
      )}

      <p className="composer-hint">Admits the accounts a Circles avatar trusts.</p>

      <label className="duration-field">
        <span className="duration-label">Avatar</span>
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
        <span className="duration-hint">
          {anchor
            ? `${anchor.name} is ${KIND_WORD[anchor.kind]} on Circles.`
            : 'A Circles account: a person, a group or an organization.'}
        </span>
      </label>

      {anchor === null && found !== null && (
        <div className="pick-list pick-list-scroll">
          {found.length === 0 ? (
            <p className="composer-hint">No avatar goes by that name.</p>
          ) : (
            found.map((avatar) => (
              <PickRow
                key={avatar.address}
                kind={avatar.kind}
                label={avatar.name}
                sub={<span className="mono address-full">{avatar.address}</span>}
                onChoose={() => setAnchor(avatar)}
              />
            ))
          )}
        </div>
      )}

      {anchor && (
        <>
          <Segmented
            label="Who this registry admits"
            value={requireHuman ? 'people' : 'any'}
            onChange={(who) => setRequireHuman(who === 'people')}
            options={[
              { id: 'people', label: 'People' },
              { id: 'any', label: 'Any avatar' },
            ]}
          />
          <p className="composer-hint">{requireHuman ? ADMITS.people : ADMITS.any}</p>
          <p className="composer-hint">This registry will admit {admits(requireHuman, anchor.name)}.</p>
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
 * The one place identity registries are made and kept: the allowlists this account owns, and the
 * Circles registries anyone can use. Two kinds with nothing in common but the question they answer
 * - a list you write yourself, and a graph somebody else already keeps - so they sit on separate
 * tabs rather than in one column where the search field for one reads as part of the other.
 *
 * Choosing one for a debate is a different question, answered in the join settings, which lists
 * what exists and links here. Both panels stay mounted, so flipping tabs does not throw away a
 * half-typed address.
 */
export function RegistryManager({ only }: { only?: RegistryKind }) {
  const access = useRegistries();
  const [tab, setTab] = useState<RegistryKind>('allowlists');
  const shown = only ?? tab;

  if (!access) {
    return <p className="composer-hint">No deployment to read registries from.</p>;
  }

  return (
    <>
      {/* Opened from a list of one kind, the manager keeps to that kind: the reader came here to
          work on it, not to be handed the other one back. */}
      {only === undefined && (
        <Tabs
          active={tab}
          onSelect={setTab}
          tabs={[
            { id: 'allowlists', label: 'Allowlists' },
            { id: 'circles', label: 'Circles' },
          ]}
        />
      )}

      {shown === 'allowlists' ? (
        <div className="tab-panel" role="tabpanel">
          <AllowlistPanel access={access} />
        </div>
      ) : (
        <div className="tab-panel" role="tabpanel">
          <CirclesPanel access={access} />
        </div>
      )}
    </>
  );
}
