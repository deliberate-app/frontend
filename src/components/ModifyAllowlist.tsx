import { useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import type { MembershipChange } from '../data/actions';
import type { RegistryAccess } from '../data/registries';
import { looksLikeAddress, parseAddressList, writeAddressRow } from '../lib/address';
import { useCirclesNames } from '../lib/circles';
import { setRegistryName, useRegistryNames } from '../lib/registryNames';
import { AddressBadge } from './AddressBadge';
import { Modal } from './Modal';

/** A small trashcan, drawn in strokes like every other icon in the app (principle 1). */
function TrashIcon() {
  return (
    <svg className="trash-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 4.6h9.6M6.4 4.6V3.2h3.2v1.4M4.6 4.6l.55 8.1a1 1 0 0 0 1 .9h3.7a1 1 0 0 0 1-.9l.55-8.1M6.8 7v4M9.2 7v4" />
    </svg>
  );
}

/** Names a count with its own noun, singular where there is one of it. */
const counted = (many: number, noun: string) => `${many} ${noun}${many === 1 ? '' : 's'}`;

/**
 * What the pending changes come to, in words. Only what applies is named: a list that is only
 * being added to says nothing about removals.
 */
export function changeSummary(adding: number, removing: number): string {
  return [adding > 0 && counted(adding, 'addition'), removing > 0 && counted(removing, 'removal')]
    .filter((part) => part !== false)
    .join(', ');
}

/** What is wrong with a written row, or null while there is nothing to say about it. */
export function rowProblem(row: string, members: ReadonlySet<string>): string | null {
  const written = row.trim();
  if (written === '') return null;
  if (!looksLikeAddress(written)) return 'Not an address.';
  return members.has(written.toLowerCase()) ? 'Already on this list.' : null;
}

/**
 * How one row of the account list reads: an empty row is the dashed invitation to write the next
 * account (principle 4), and a row that cannot be added says so on its own edge.
 */
const rowMark = (row: string, members: ReadonlySet<string>) =>
  row.trim() === '' ? ' address-row-empty' : rowProblem(row, members) ? ' address-row-invalid' : '';

/**
 * One allowlist and who is on it.
 *
 * Changes are gathered rather than sent one at a time: the trashcan marks an account to go, the
 * empty row at the foot of the list takes the ones to come, and saving writes them together, which
 * the contract takes as one call and the owner signs once.
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
  const [dropping, setDropping] = useState<Address[]>([]);
  const [rows, setRows] = useState<string[]>(['']);
  // The field keeps what was typed; the store keeps it trimmed. Reading the stored form back into
  // the field would eat a trailing space the moment it was typed, since a name is stored trimmed.
  const [name, setName] = useState(() => names[registry.toLowerCase()] ?? '');
  const [busy, setBusy] = useState(false);
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
  const onList = useMemo(() => new Set((members ?? []).map((member) => member.toLowerCase())), [members]);
  // An address already on the list is not added again, so it is neither counted nor sent.
  const adding = useMemo(
    () => parseAddressList(rows.join(' ')).addresses.filter((address) => !onList.has(address.toLowerCase())),
    [rows, onList],
  );
  const problems = [...new Set(rows.map((row) => rowProblem(row, onList)).filter((problem) => problem !== null))];

  // Removals first, so a list reworked in one go reads in the order it was written.
  const changes: MembershipChange[] = [
    ...dropping.map((account) => ({ account, member: false })),
    ...adding.map((account) => ({ account, member: true })),
  ];

  const save = async () => {
    if (!setMembership || changes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await setMembership(registry, changes);
      setMembers(await loadMembers(registry));
      setDropping([]);
      setRows(['']);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
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

      <p className="member-head">
        {members === null
          ? 'Loading the list…'
          : members.length === 0
            ? 'Nobody on this list yet.'
            : `${members.length} ${members.length === 1 ? 'account' : 'accounts'} on this list`}
      </p>

      {/* The accounts on the list and the ones being written run as one column, so an addition
          arrives where the list ends rather than in a section of its own. */}
      <ul className="member-list">
        {(members ?? []).map((member) => (
          <li key={member} className={`member-row ${dropping.includes(member) ? 'member-going' : ''}`}>
            <AddressBadge address={member} full />
            {circlesNames[member] && <span className="member-name">{circlesNames[member]}</span>}
            {setMembership && (
              <button
                type="button"
                className="member-drop"
                aria-label={dropping.includes(member) ? `Keep ${member}` : `Remove ${member}`}
                title={dropping.includes(member) ? 'Keep on this list' : 'Remove when saved'}
                disabled={busy}
                onClick={() =>
                  setDropping((going) =>
                    going.includes(member) ? going.filter((one) => one !== member) : [...going, member],
                  )
                }
              >
                <TrashIcon />
              </button>
            )}
          </li>
        ))}
        {setMembership &&
          rows.map((row, index) => (
            <li key={`row-${index}`} className="member-row">
              <input
                // Rows are addressed by position: a paste inserts several at once, and the value
                // each input shows comes from the state rather than from the element.
                type="text"
                className={`text-input address-row${rowMark(row, onList)}`}
                spellCheck={false}
                placeholder="Insert member address"
                value={row}
                disabled={busy}
                onChange={(event) => setRows((current) => writeAddressRow(current, index, event.target.value))}
              />
            </li>
          ))}
      </ul>

      {problems.map((problem) => (
        <p key={problem} className="action-error">
          {problem}
        </p>
      ))}

      {setMembership && changes.length > 0 && (
        <div className="action-row">
          <button type="button" className="btn btn-solid" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Update'}
          </button>
          <span className="duration-hint">{changeSummary(adding.length, dropping.length)}</span>
        </div>
      )}

      {error && <p className="action-error">{error}</p>}
    </Modal>
  );
}
