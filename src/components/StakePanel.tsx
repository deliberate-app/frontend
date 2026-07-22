import { useState } from 'react';
import { actionErrorMessage } from '../data/actions';
import type { Side } from '../types';

/**
 * Rating controls for the focused argument: stake vote tokens on it being under-
 * or overrated. Stance-free on purpose - one can agree with an argument and still
 * call it overrated. Underneath, the stake buys pro or con shares of its market.
 */
export function StakePanel({
  tokens,
  feePercentage,
  onStake,
}: {
  tokens: number;
  /** The debate's market fee in percent, creator-chosen at creation. */
  feePercentage: number;
  onStake: (side: Side, amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState(5);
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalid = !Number.isInteger(amount) || amount < 1 || amount > tokens;

  const stake = async (side: Side) => {
    setBusy(side);
    setError(null);
    try {
      await onStake(side, amount);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="action-panel">
      <div className="action-row">
        <label className="action-amount">
          Stake
          <input
            type="number"
            min={1}
            max={tokens}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
          ⬡
        </label>
        <button
          type="button"
          className="btn btn-pro"
          title="Buys good-argument shares - they pay the argument's final rating."
          onClick={() => stake('pro')}
          disabled={busy !== null || invalid}
        >
          {busy === 'pro' ? 'Staking…' : 'Underrated ↑'}
        </button>
        <button
          type="button"
          className="btn btn-con"
          title="Buys bad-argument shares - they pay the complement of the final rating."
          onClick={() => stake('con')}
          disabled={busy !== null || invalid}
        >
          {busy === 'con' ? 'Staking…' : 'Overrated ↓'}
        </button>
        <span className="action-hint">
          You profit if the rating corrects your way once the debate ends
          {feePercentage > 0 ? ` · ${feePercentage}% fee to the argument's creator` : ' · no market fee'}
        </span>
      </div>
      {error && <p className="action-error">{error}</p>}
    </div>
  );
}
