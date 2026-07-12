import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';
import type { Side } from '../types';

/** The minimum argument deposit, mirroring the contract's `_MIN_DEBATE_DEPOSIT`. */
const MIN_DEPOSIT = 10;

/** The authoring form: writes an argument beneath the focused claim during Editing. */
export function Composer({
  side,
  tokens,
  onAdd,
}: {
  side: Side;
  tokens: number;
  onAdd: (side: Side, initialApproval: number, deposit: number, text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [approval, setApproval] = useState(50);
  const [deposit, setDeposit] = useState(MIN_DEPOSIT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    const affordable = tokens >= MIN_DEPOSIT;
    return (
      <button
        type="button"
        className="composer-open"
        onClick={() => setOpen(true)}
        disabled={!affordable}
        title={affordable ? undefined : `An argument costs at least ${MIN_DEPOSIT} vote tokens`}
      >
        + Add {side} argument · from {MIN_DEPOSIT} ⬡
      </button>
    );
  }

  // The deposit seeds the market and sets the argument's starting weight: at least
  // the minimum, at most the balance.
  const depositValid = Number.isInteger(deposit) && deposit >= MIN_DEPOSIT && deposit <= tokens;
  const canSubmit = !busy && text.trim().length > 0 && depositValid;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAdd(side, approval, deposit, text.trim());
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
      <label className="composer-approval composer-deposit">
        Stake <strong className="mono">{deposit} ⬡</strong>
        <input
          type="number"
          min={MIN_DEPOSIT}
          max={tokens}
          step={1}
          value={deposit}
          onChange={(event) => setDeposit(Math.floor(Number(event.target.value)))}
        />
      </label>
      <p className={`composer-hint${depositValid ? '' : ' composer-hint-error'}`}>
        {depositValid
          ? 'A larger stake deepens the market and gives the argument more starting weight.'
          : deposit > tokens
            ? `You only have ${tokens} ⬡ in this debate.`
            : `The minimum deposit is ${MIN_DEPOSIT} ⬡.`}
      </p>
      <div className="action-row">
        <button type="submit" className="btn btn-solid" disabled={!canSubmit}>
          {busy ? 'Publishing…' : `Publish · ${deposit} ⬡`}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && <p className="action-error">{error}</p>}
    </form>
  );
}
