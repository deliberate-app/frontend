import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';
import { contentError, MAX_CONTENT_BYTES } from '../lib/content';
import { formatVotes, MIN_DEPOSIT_UNITS, toTokens, toUnits } from '../lib/votes';
import type { Side } from '../types';
import { ContentBudget } from './ContentBudget';

/** The minimum argument deposit, mirroring the contract's `_MIN_DEBATE_DEPOSIT`. */

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
  // 75% is the midpoint of the clamped sway scale (ADR-0012): half sway, with symmetric room
  // for the market to double the argument or erase it. 50% would seed at zero sway.
  const [approval, setApproval] = useState(75);
  const [deposit, setDeposit] = useState(MIN_DEPOSIT_UNITS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    const affordable = tokens >= MIN_DEPOSIT_UNITS;
    return (
      <button
        type="button"
        className="composer-open"
        onClick={() => setOpen(true)}
        disabled={!affordable}
        title={affordable ? undefined : `You only have ${formatVotes(tokens)} ⬡ in this debate.`}
      >
        + Add {side} argument · min deposit {formatVotes(MIN_DEPOSIT_UNITS)} ⬡
      </button>
    );
  }

  // The deposit seeds the market and is the stake the argument starts with: at least
  // the minimum, at most the balance.
  const depositValid = Number.isInteger(deposit) && deposit >= MIN_DEPOSIT_UNITS && deposit <= tokens;
  const canSubmit = !busy && contentError(text.trim()) === null && depositValid;

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
        maxLength={MAX_CONTENT_BYTES}
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
        Deposit <strong className="mono">{formatVotes(deposit)} ⬡</strong>
        <input
          type="number"
          min={toTokens(MIN_DEPOSIT_UNITS)}
          max={toTokens(tokens)}
          step={0.01}
          value={toTokens(deposit)}
          onChange={(event) => setDeposit(toUnits(Number(event.target.value)))}
        />
      </label>
      <p className={`composer-hint${depositValid ? '' : ' composer-hint-error'}`}>
        {depositValid
          ? 'A larger deposit deepens the market and puts more stake behind the argument from the start.'
          : deposit > tokens
            ? `You only have ${formatVotes(tokens)} ⬡ in this debate.`
            : `The minimum deposit is ${formatVotes(MIN_DEPOSIT_UNITS)} ⬡.`}
      </p>
      <div className="action-row">
        <button type="submit" className="btn btn-solid" disabled={!canSubmit}>
          {busy ? 'Adding…' : `Add · ${formatVotes(deposit)} ⬡`}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <ContentBudget text={text.trim()} />
      </div>
      {error && <p className="action-error">{error}</p>}
    </form>
  );
}
