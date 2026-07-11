import { useState } from 'react';
import { actionErrorMessage } from '../data/actions';
import type { Side } from '../types';

/** Rating controls for the focused argument: invest vote tokens into its pro or con side. */
export function InvestPanel({
  tokens,
  onInvest,
}: {
  tokens: number;
  onInvest: (side: Side, amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState(5);
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalid = !Number.isInteger(amount) || amount < 1 || amount > tokens;

  const invest = async (side: Side) => {
    setBusy(side);
    setError(null);
    try {
      await onInvest(side, amount);
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
          Invest
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
          onClick={() => invest('pro')}
          disabled={busy !== null || invalid}
        >
          {busy === 'pro' ? 'Investing…' : 'Invest pro'}
        </button>
        <button
          type="button"
          className="btn btn-con"
          onClick={() => invest('con')}
          disabled={busy !== null || invalid}
        >
          {busy === 'con' ? 'Investing…' : 'Invest con'}
        </button>
        <span className="action-hint">5% fee goes to the argument's creator</span>
      </div>
      {error && <p className="action-error">{error}</p>}
    </div>
  );
}
