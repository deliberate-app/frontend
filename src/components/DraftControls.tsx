import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';
import { contentError, MAX_CONTENT_BYTES } from '../lib/content';
import { ContentBudget } from './ContentBudget';

/** A finalized argument a draft can be moved beneath. */
export interface MoveTarget {
  id: number;
  label: string;
}

/**
 * Owner-only controls for a still-draft argument during Editing: edit its text, or
 * move it beneath a different finalized argument. Moving keeps the pro/con stance and
 * re-seeds the market at a chosen approval. Both are contract calls.
 */
export function DraftControls({
  text,
  currentApproval,
  moveTargets,
  onEdit,
  onMove,
}: {
  text: string;
  /** The argument's current approval as a percentage; the move slider defaults to it. */
  currentApproval: number;
  moveTargets: MoveTarget[];
  onEdit: (text: string) => Promise<void>;
  onMove: (newParentArgumentId: number, initialApproval: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'edit' | 'move'>('idle');
  const [draft, setDraft] = useState(text);
  const [parentId, setParentId] = useState<number | ''>(moveTargets[0]?.id ?? '');
  const [approval, setApproval] = useState(currentApproval);
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
          maxLength={MAX_CONTENT_BYTES}
          required
        />
        <div className="action-row">
          <button type="submit" className="btn btn-solid" disabled={busy || contentError(draft.trim()) !== null}>
            {busy ? 'Saving…' : 'Save text'}
          </button>
          <button type="button" className="btn" onClick={() => setMode('idle')} disabled={busy}>
            Cancel
          </button>
          <ContentBudget text={draft.trim()} />
        </div>
        {error && <p className="action-error">{error}</p>}
      </form>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parentId !== '') void run(() => onMove(parentId, approval));
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
      <label className="composer-approval">
        Initial approval <strong className="mono">{approval}%</strong>
        <input
          type="range"
          min={50}
          max={99}
          value={approval}
          onChange={(event) => setApproval(Number(event.target.value))}
        />
      </label>
      <p className="action-hint">
        Keeps its pro/con stance and re-seeds its rating at this approval under the new parent.
      </p>
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
