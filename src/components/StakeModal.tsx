import { useState } from 'react';
import { actionErrorMessage } from '../data/actions';
import { formatImpact, IMPACT_HINT, impactsOf } from '../lib/impact';
import { previewStake, withPreviewedStake } from '../lib/market';
import type { ArgumentNode, Debate, Side } from '../types';

/** The stake the modal opens with; the slider runs from one token to the whole balance. */
const DEFAULT_AMOUNT = 5;

const signClassOf = (value: number) => (value > 0 ? 'impact-pos' : value < 0 ? 'impact-neg' : '');

/** A signed figure as it stands and as the stake would leave it, both on the ±100% scale. */
function Shift({ before, after }: { before: number; after: number | null }) {
  return (
    <span className="stake-shift">
      <span className={`mono ${signClassOf(before)}`}>{formatImpact(before)}</span>
      <span className="stake-arrow" aria-hidden="true">
        →
      </span>
      {after === null ? (
        <span className="mono">—</span>
      ) : (
        <strong className={`mono ${signClassOf(after)}`}>{formatImpact(after)}</strong>
      )}
    </span>
  );
}

/**
 * Rating the focused argument: stake vote tokens on it being under- or overrated, and see what the
 * stake would do before sending it - the market approval and the impact on the parent, as they
 * stand and as they would stand, recomputed from the debate as it is right now (the tree behind
 * this modal keeps refreshing while it is open, so the figures move when someone else stakes).
 * Stance-free on purpose - one can agree with an argument and still call it overrated. Underneath,
 * the stake buys good- or bad-argument shares of its market.
 */
export function StakeModal({
  debate,
  node,
  tokens,
  onStake,
  onClose,
}: {
  debate: Debate;
  node: ArgumentNode;
  /** The account's vote token balance in this debate - the most it can stake. */
  tokens: number;
  onStake: (side: Side, amount: number) => Promise<void>;
  onClose: () => void;
}) {
  const [side, setSide] = useState<Side>('pro');
  const [amount, setAmount] = useState(Math.min(DEFAULT_AMOUNT, Math.max(tokens, 1)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = Number.isInteger(amount) && amount >= 1 && amount <= tokens;

  // The stake as the contract would execute it against the market as it stands now, and the
  // tally mirror's reading of the tree with that one market moved.
  const preview = valid ? previewStake(node, side, amount, debate.feePercentage) : null;
  const impactBefore = impactsOf(debate).get(node.id) ?? 0;
  const impactAfter = preview ? (impactsOf(withPreviewedStake(debate, node.id, preview)).get(node.id) ?? 0) : null;

  const stake = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onStake(side, amount);
      onClose();
    } catch (cause) {
      setError(actionErrorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Stake on this argument"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Stake on this argument</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="stake-sides" role="radiogroup" aria-label="Direction">
          <button
            type="button"
            role="radio"
            aria-checked={side === 'pro'}
            className={`btn btn-pro ${side === 'pro' ? 'stake-side-active' : ''}`}
            title="Buys good-argument shares - they pay the argument's tallied rating as a price."
            onClick={() => setSide('pro')}
            disabled={busy}
          >
            Underrated ↑
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={side === 'con'}
            className={`btn btn-con ${side === 'con' ? 'stake-side-active' : ''}`}
            title="Buys bad-argument shares - they pay the complement of the tallied rating."
            onClick={() => setSide('con')}
            disabled={busy}
          >
            Overrated ↓
          </button>
        </div>

        <label className="stake-amount">
          <span className="stake-amount-label">
            Amount <span className="stake-amount-of">of your {tokens} ⬡</span>
          </span>
          <span className="stake-amount-inputs">
            <input
              type="range"
              min={1}
              max={Math.max(tokens, 1)}
              step={1}
              value={valid ? amount : 1}
              onChange={(event) => setAmount(Number(event.target.value))}
              disabled={busy || tokens < 1}
              aria-label="Amount to stake"
            />
            <input
              type="number"
              min={1}
              max={tokens}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              disabled={busy || tokens < 1}
              aria-label="Amount to stake, in vote tokens"
            />
            ⬡
          </span>
        </label>

        <dl className="market-facts">
          <dt>Market approval</dt>
          <dd>
            <Shift before={2 * node.approval - 1} after={preview ? 2 * preview.approval - 1 : null} />
          </dd>
          <dt title={IMPACT_HINT}>Impact on parent</dt>
          <dd>
            <Shift before={impactBefore} after={impactAfter} />
          </dd>
          <dt>Fee to the author</dt>
          <dd className="mono">{preview ? `${preview.fee} ⬡` : '—'}</dd>
        </dl>

        <button type="button" className="btn btn-solid" onClick={() => void stake()} disabled={busy || !valid}>
          {busy ? 'Staking…' : `Stake ${valid ? amount : '—'} ⬡ · ${side === 'pro' ? 'Underrated ↑' : 'Overrated ↓'}`}
        </button>
        <p className="composer-hint">
          {tokens < 1
            ? 'You have no vote tokens left in this debate.'
            : 'You profit if the tallied rating ends up on your side of the price you paid. The impact is ' +
              'a live projection: the tally weighs prices by how long they stood, so a late stake moves ' +
              'the final rating less than shown.'}
        </p>
        {error && <p className="action-error">{error}</p>}
      </div>
    </div>
  );
}
