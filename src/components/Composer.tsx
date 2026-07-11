import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';
import type { Side } from '../types';

/** The authoring form: writes an argument beneath the focused claim during Editing. */
export function Composer({
  side,
  tokens,
  onAdd,
}: {
  side: Side;
  tokens: number;
  onAdd: (side: Side, initialApproval: number, text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [approval, setApproval] = useState(70);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    const affordable = tokens >= 10;
    return (
      <button
        type="button"
        className="composer-open"
        onClick={() => setOpen(true)}
        disabled={!affordable}
        title={affordable ? undefined : 'An argument costs 10 vote tokens'}
      >
        + Add {side} argument · 10 ⬡
      </button>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAdd(side, approval, text.trim());
      setOpen(false);
      setText('');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        className="composer-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={`Your ${side} argument…`}
        rows={3}
        maxLength={2000}
        required
      />
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
      <div className="action-row">
        <button type="submit" className="btn btn-solid" disabled={busy || text.trim().length === 0}>
          {busy ? 'Publishing…' : 'Publish · 10 ⬡'}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="action-error">{error}</p>}
    </form>
  );
}
