import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';

/** A finalized argument a draft can be moved beneath. */
export interface MoveTarget {
  id: number;
  label: string;
}

/**
 * Owner-only controls for a still-draft argument during Editing: edit its text, or
 * move it beneath a different finalized argument. The argument keeps its pro/con
 * stance when moved. Both run through the content pipeline / contract.
 */
export function DraftControls({
  text,
  moveTargets,
  onEdit,
  onMove,
}: {
  text: string;
  moveTargets: MoveTarget[];
  onEdit: (text: string) => Promise<void>;
  onMove: (newParentArgumentId: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'edit' | 'move'>('idle');
  const [draft, setDraft] = useState(text);
  const [parentId, setParentId] = useState<number | ''>(moveTargets[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (op: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await op();
      setMode('idle');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'idle') {
    return (
      <div className="draft-controls">
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setDraft(text);
            setError(null);
            setMode('edit');
          }}
        >
          Edit text
        </button>
        {moveTargets.length > 0 && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setError(null);
              setMode('move');
            }}
          >
            Move
          </button>
        )}
      </div>
    );
  }

  if (mode === 'edit') {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      void run(() => onEdit(draft.trim()));
    };
    return (
      <form className="composer" onSubmit={submit}>
        <textarea
          className="composer-text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={2000}
          required
        />
        <div className="action-row">
          <button type="submit" className="btn btn-solid" disabled={busy || draft.trim().length === 0}>
            {busy ? 'Saving…' : 'Save text'}
          </button>
          <button type="button" className="btn" onClick={() => setMode('idle')} disabled={busy}>
            Cancel
          </button>
        </div>
        {error && <p className="action-error">{error}</p>}
      </form>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parentId !== '') void run(() => onMove(parentId));
  };
  return (
    <form className="composer" onSubmit={submit}>
      <label className="create-unit">
        Move beneath
        <select value={parentId} onChange={(event) => setParentId(Number(event.target.value))}>
          {moveTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
      </label>
      <p className="action-hint">The argument keeps its pro/con stance under the new parent.</p>
      <div className="action-row">
        <button type="submit" className="btn btn-solid" disabled={busy || parentId === ''}>
          {busy ? 'Moving…' : 'Move here'}
        </button>
        <button type="button" className="btn" onClick={() => setMode('idle')} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="action-error">{error}</p>}
    </form>
  );
}
