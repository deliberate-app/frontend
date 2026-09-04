import { useEffect, useState } from 'react';
import { isAddress, type Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { IdentityRegistryInfo } from '../data/source';
import { shortAddress } from '../lib/address';
import { circlesAvatarOf } from '../lib/circles';
import { AddressChip } from './AddressChip';
import { Modal } from './Modal';

/**
 * The connected account's allowlists, and who is on each. An owner adds and removes accounts here;
 * every debate that names the list is admitting from it at that moment, so a change reaches them all
 * at once. Members are labelled with their Circles name where Circles knows one.
 */
export function AllowlistManager({
  registries,
  loadMembers,
  setMembership,
  onClose,
}: {
  /** The account's allowlists, newest first. */
  registries: IdentityRegistryInfo[];
  /** The accounts currently on a list, from the index. */
  loadMembers: (registry: Address) => Promise<Address[]>;
  /** Adds or removes accounts; resolves once the index has folded the change. */
  setMembership: (registry: Address, accounts: Address[], member: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Address | null>(registries[0]?.address ?? null);
  const [members, setMembers] = useState<Address[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async (registry: Address) => {
    setMembers(null);
    setMembers(await loadMembers(registry));
  };

  useEffect(() => {
    if (selected === null) return;
    let stale = false;
    loadMembers(selected)
      .then((loaded) => {
        if (!stale) setMembers(loaded);
      })
      .catch((cause) => {
        if (!stale) setError(actionErrorMessage(cause));
      });
    return () => {
      stale = true;
    };
  }, [selected, loadMembers]);

  // Circles names for the members, resolved once each; a member Circles does not know keeps its address.
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
    if (selected === null) return;
    setBusy(true);
    setError(null);
    try {
      await setMembership(selected, accounts, member);
      await reload(selected);
      if (member) setDraft('');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const draftValid = isAddress(draft.trim());

  return (
    <Modal title="Your allowlists" onClose={onClose}>
      {registries.length === 0 ? (
        <p className="composer-hint">
          You keep no allowlist yet. Make one in <em>Who may join</em> when starting a debate.
        </p>
      ) : (
        <>
          {registries.length > 1 && (
            <div className="registry-list">
              {registries.map((registry) => (
                <button
                  key={registry.address}
                  type="button"
                  className={`registry-item ${selected === registry.address ? 'registry-item-active' : ''}`}
                  onClick={() => setSelected(registry.address)}
                >
                  <span className="registry-kind">Allowlist</span>
                  <span className="mono">{shortAddress(registry.address)}</span>
                </button>
              ))}
            </div>
          )}
          {registries.length === 1 && (
            <p className="composer-hint">
              Allowlist <span className="mono">{shortAddress(registries[0]!.address)}</span>. Name it as a debate's
              registry to admit only the accounts below.
            </p>
          )}

          {members === null ? (
            <p className="composer-hint">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="composer-hint">No accounts on this list yet.</p>
          ) : (
            <ul className="member-list">
              {members.map((member) => (
                <li key={member} className="member-row">
                  <AddressChip address={member} />
                  {names[member] && <span className="member-name">{names[member]}</span>}
                  <button
                    type="button"
                    className="btn btn-small member-remove"
                    disabled={busy}
                    onClick={() => void change([member], false)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="duration-field">
            <span className="duration-label">Add</span>
            <span className="duration-inputs">
              <input
                type="text"
                inputMode="text"
                spellCheck={false}
                placeholder="0x…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-small"
                disabled={busy || !draftValid}
                onClick={() => void change([draft.trim() as Address], true)}
              >
                {busy ? 'Saving…' : 'Add'}
              </button>
            </span>
            <span className="duration-hint">
              An account on the list may join every debate that names it. Removing one bars it from joining afterwards;
              debates it already joined are unaffected.
            </span>
          </label>
          {error && <p className="action-error">{error}</p>}
        </>
      )}
    </Modal>
  );
}
