import { useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { RegistryAccess } from '../data/registries';
import { looksLikeAddress, parseAddressList, writeAddressRow } from '../lib/address';
import { useCirclesNames } from '../lib/circles';
import { setRegistryName, useRegistryNames } from '../lib/registryNames';
import { AddressBadge } from './AddressBadge';
import { Modal } from './Modal';

/**
 * How one row of the account list reads: an empty row is the dashed invitation to write the next
 * account (principle 4), and a row that is not an address says so on its own edge.
 */
const rowMark = (row: string) =>
  row.trim() === '' ? ' address-row-empty' : looksLikeAddress(row) ? '' : ' address-row-invalid';

/**
 * One allowlist and who is on it. Adding and removing are the only reasons to open it, so they are
 * all it holds - the list of lists stays behind, where choosing which one to open belongs.
 *
 * Every debate naming this list admits from it at the moment someone joins, so a change here
 * reaches them all at once.
 */
export function ModifyAllowlist({
  registry,
  access: { loadMembers, setMembership },
  onClose,
}: {
  registry: Address;
  access: RegistryAccess;
  onClose: () => void;
}) {
  const names = useRegistryNames();
  const [members, setMembers] = useState<Address[] | null>(null);
  const [checked, setChecked] = useState<Address[]>([]);
  const [rows, setRows] = useState<string[]>(['']);
  // The field keeps what was typed; the store keeps it trimmed. Reading the stored form back into
  // the field would eat a trailing space the moment it was typed, since a name is stored trimmed.
  const [name, setName] = useState(() => names[registry.toLowerCase()] ?? '');
  const [busy, setBusy] = useState<'adding' | 'removing' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    loadMembers(registry)
      .then((loaded) => {
        if (!stale) setMembers(loaded);
      })
      .catch((cause) => {
        if (!stale) setError(actionErrorMessage(cause));
      });
    return () => {
      stale = true;
    };
  }, [registry, loadMembers]);

  const circlesNames = useCirclesNames(members ?? []);
  const pasted = useMemo(() => parseAddressList(rows.join(' ')), [rows]);

  const change = async (accounts: Address[], member: boolean) => {
    if (!setMembership) return;
    setBusy(member ? 'adding' : 'removing');
    setError(null);
    try {
      await setMembership(registry, accounts, member);
      setMembers(await loadMembers(registry));
      setChecked([]);
      if (member) setRows(['']);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Modify allowlist" onClose={onClose} wide>
      <p className="mono address-full">{registry}</p>

      <label className="duration-field">
        <span className="duration-label">Name</span>
        <input
          type="text"
          className="text-input"
          placeholder="Unnamed"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setRegistryName(registry, event.target.value);
          }}
        />
        <span className="duration-hint">Kept in this browser; only you see it.</span>
      </label>

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
                  <AddressBadge address={member} full />
                </label>
              ) : (
                <AddressBadge address={member} full />
              )}
              {circlesNames[member] && <span className="member-name">{circlesNames[member]}</span>}
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
                  // Rows are addressed by position: a paste inserts several at once, and the value
                  // each input shows comes from the state rather than from the element.
                  key={index}
                  type="text"
                  className={`text-input address-row${rowMark(row)}`}
                  spellCheck={false}
                  placeholder="0x…"
                  value={row}
                  onChange={(event) => setRows((current) => writeAddressRow(current, index, event.target.value))}
                />
              ))}
            </div>
            <span className="duration-hint">One per row; paste a list to fill several.</span>
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

      {error && <p className="action-error">{error}</p>}
    </Modal>
  );
}
