import { useEffect, useMemo, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { RegistryAccess } from '../data/registries';
import { useRegistries } from '../data/registries';
import type { IdentityRegistryInfo } from '../data/source';
import { shortAddress } from '../lib/address';
import { searchCirclesAvatars, useCirclesNames, type CirclesAvatar } from '../lib/circles';
import { nameOf, useRegistryNames } from '../lib/registryNames';
import { useHostedAccount } from '../wallet/hostedAccount';
import { PickRow, Segmented, Tabs } from './Choice';
import { ConnectHere } from './ConnectHere';
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

/**
 * The two kinds of registry. The app's own word for a kind, so a row read from the index and a tab
 * that names one cannot be a letter apart and typecheck anyway.
 */
export type RegistryKind = IdentityRegistryInfo['kind'];

/** What each kind is called: as a title over it, and inside a sentence about it. */
export const KIND_WORDS: Record<RegistryKind, { title: string; noun: string }> = {
  allowlist: { title: 'Allowlists', noun: 'allowlists' },
  circles: { title: 'Circles registries', noun: 'Circles registries' },
};

/** One sentence for one empty list, in the dialog that keeps them and the one that picks from them. */
export const NO_ALLOWLISTS = 'No allowlists yet.';

/** Why the manager is showing lists but no way to add to them, said above the way to fix it. */
const NEEDS_WALLET = 'Connect a wallet to make one.';

/**
 * Why a registry cannot be made here, and the way past it where the reader has one.
 *
 * Making one needs both a wallet and a factory on this network, so the missing action has two
 * causes and only one of them is the reader's to fix. Offering to connect against the other would
 * hand them buttons that change nothing.
 */
function NoWayToMake({ access }: { access: RegistryAccess }) {
  return access.factory === undefined ? (
    <p className="composer-hint">This network has no registry factory.</p>
  ) : (
    <ConnectHere why={NEEDS_WALLET} />
  );
}

/**
 * Who a Circles registry admits, in the words the app uses for it everywhere.
 *
 * "People" is what Circles registers an avatar as, which is a social graph rather than a proof of
 * personhood, so the option that says so carries the caveat and the label stays plain.
 */
const admits = (requireHuman: boolean, who: string) =>
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

/** One registry as it is offered: the words it goes by, and what is worth saying beside them. */
export interface RegistryRow {
  registry: IdentityRegistryInfo;
  /** The kind, in the word the row leads with. */
  kind: string;
  label: string;
  /** The browser-local name, where the reader has given one. Allowlists only. */
  name?: string;
  /** A short aside at the trailing edge, where there is something to say. */
  note?: string;
}

/**
 * The registries of one kind, in the order they are offered and under the names they are offered
 * by.
 *
 * One source for both hosts. Keeping registries and choosing one are different questions, answered
 * in different dialogs, but they are the same rows - and written twice they had already come to
 * disagree about ordering, about the mark on a superseded registry, and about what an unnamed list
 * is called.
 */
export function useRegistryRows(access: RegistryAccess, kind: RegistryKind): RegistryRow[] {
  const { registries, factory, circlesRegistry } = access;
  const ofKind = useMemo(
    () =>
      currentFactoryFirst(
        registries.filter((registry) => registry.kind === kind),
        factory,
      ),
    [registries, factory, kind],
  );

  const names = useRegistryNames();
  // Empty for allowlists, which have no anchor; the hook keys on the addresses, not on the array.
  const anchorNames = useCirclesNames(
    ofKind
      .map((registry) => registry.anchor)
      .filter((anchor): anchor is Address => anchor !== undefined && anchor !== zeroAddress),
  );

  return ofKind.map((registry) => {
    const name = nameOf(names, registry.address);
    const isDeployment =
      circlesRegistry !== undefined && registry.address.toLowerCase() === circlesRegistry.toLowerCase();
    return {
      registry,
      kind: kind === 'allowlist' ? 'Allowlist' : 'Circles',
      label:
        kind === 'allowlist'
          ? (name ?? 'Unnamed')
          : circlesRegistryLabel(registry, registry.anchor && anchorNames[registry.anchor]),
      name,
      note: fromOlderFactory(registry, factory) ? 'older factory' : isDeployment ? 'this network' : undefined,
    };
  });
}

/**
 * The allowlists this account keeps. One row each, and one way to make another - who is on a list
 * is a question for that list, answered in `ModifyAllowlist`, so it does not sit between the rows
 * and the button that adds to them.
 */
function AllowlistPanel({ access }: { access: RegistryAccess }) {
  const { createAllowlist } = access;
  const rows = useRegistryRows(access, 'allowlist');

  const [editing, setEditing] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {rows.length === 0 ? (
        <p className="composer-hint">{NO_ALLOWLISTS}</p>
      ) : (
        <div className="pick-list">
          {rows.map((row) => (
            <PickRow
              key={row.registry.address}
              kind={row.kind}
              label={row.label}
              note={
                <>
                  {row.note && <span className="pick-row-aside">{row.note}</span>}
                  <span className="btn btn-small">Edit</span>
                </>
              }
              address={row.registry.address}
              onChoose={() => setEditing(row.registry.address)}
            />
          ))}
        </div>
      )}

      {createAllowlist ? (
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void create()}>
          {busy ? 'Creating…' : 'New allowlist'}
        </button>
      ) : (
        <NoWayToMake access={access} />
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
function CirclesPanel({ access }: { access: RegistryAccess }) {
  const { createCircles } = access;
  const rows = useRegistryRows(access, 'circles');

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
      {rows.length > 0 && (
        <div className="pick-list">
          {rows.map((row) => (
            <PickRow
              key={row.registry.address}
              kind={row.kind}
              label={row.label}
              note={row.note}
              address={row.registry.address}
            />
          ))}
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
                address={avatar.address}
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
            <NoWayToMake access={access} />
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
 * the same rows and links here.
 */
export function RegistryManager({ only }: { only?: RegistryKind }) {
  const access = useRegistries();
  const circlesOffered = useHostedAccount();
  const [tab, setTab] = useState<RegistryKind>('allowlist');

  if (!access) {
    return <p className="composer-hint">No deployment to read registries from.</p>;
  }

  // Without the Gnosis App there is no Circles account to keep a registry for, so allowlists are
  // the only kind and the rail that would offer a choice between two says nothing.
  const shown = circlesOffered ? (only ?? tab) : 'allowlist';

  return (
    <>
      {/* Opened from a list of one kind, the manager keeps to that kind: the reader came here to
          work on it, not to be handed the other one back. */}
      {only === undefined && circlesOffered && (
        <Tabs
          active={tab}
          onSelect={setTab}
          tabs={[
            { id: 'allowlist', label: 'Allowlists' },
            { id: 'circles', label: 'Circles' },
          ]}
        />
      )}

      <div className="tab-panel" role="tabpanel">
        {shown === 'allowlist' ? <AllowlistPanel access={access} /> : <CirclesPanel access={access} />}
      </div>
    </>
  );
}
