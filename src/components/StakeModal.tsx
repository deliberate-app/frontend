import { useState, type CSSProperties } from 'react';
import { Modal } from './Modal';
import { formatVotes, toTokens, toUnits } from '../lib/votes';
import { actionErrorMessage } from '../data/actions';
import {
  ARGUMENT_RATING_HINT,
  axisPercent,
  centered,
  formatImpact,
  IMPACT_HINT,
  signClassOf,
  tallyOf,
  WEIGHTED_RATING_HINT,
} from '../lib/impact';
import { BAD_SHARE_PAYOUT, GOOD_SHARE_PAYOUT, previewStake, withPreviewedStake } from '../lib/market';
import type { ArgumentNode, Debate, Side } from '../types';

/** The slider and the number field are one control in two shapes, so they share one name. */
const STAKE_INPUT_LABEL = 'Stake in vote tokens: positive for underrated, negative for overrated';

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

/** The direction glyph on the confirm button: a stroke arrow, up for underrated, down for overrated. */
function DirectionArrow({ side }: { side: Side }) {
  return (
    <svg className="btn-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={side === 'pro' ? 'M8 13.5 V2.5 M3.5 7 8 2.5 12.5 7' : 'M8 2.5 V13.5 M3.5 9 8 13.5 12.5 9'}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Rating the focused argument: one signed slider decides both the direction and the size of the
 * stake - left of centre calls the argument overrated (bad-argument shares), right of centre
 * underrated (good-argument shares), the distance from centre is the amount - and the modal
 * shows what the stake would do before sending it: the market approval and the impact on the
 * parent, as they stand and as they would stand, recomputed from the debate as it is right now
 * (the tree behind this modal keeps refreshing while it is open, so the figures move when someone
 * else stakes). Stance-free on purpose - one can agree with an argument and still call it
 * overrated.
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
  /** The account's vote token balance in this debate - the most it can stake either way. */
  tokens: number;
  onStake: (side: Side, amount: number) => Promise<void>;
  onClose: () => void;
}) {
  // The slider's value: negative stakes against, positive for, zero is the neutral rest.
  const [signed, setSigned] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const side: Side | null = signed > 0 ? 'pro' : signed < 0 ? 'con' : null;
  const amount = Math.abs(signed);
  const valid = side !== null && Number.isInteger(amount) && amount <= tokens;

  // The stake as the contract would execute it against the market as it stands now, and the
  // tally mirror's reading of the tree with that one market moved.
  const preview = valid && side ? previewStake(node, side, amount, debate.feePercentage) : null;
  const before = tallyOf(debate).get(node.id);
  const after = preview ? tallyOf(withPreviewedStake(debate, node.id, preview)).get(node.id) : null;

  const stake = async () => {
    if (!valid || !side) return;
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

  // The track fills from the centre to the thumb in the stance colour of the chosen direction.
  const max = Math.max(tokens, 1);
  const thumbPercent = axisPercent(signed / max);
  const trackStyle = {
    '--fill-from': `${Math.min(50, thumbPercent)}%`,
    '--fill-to': `${Math.max(50, thumbPercent)}%`,
    '--fill-color': side === 'pro' ? 'var(--pro)' : side === 'con' ? 'var(--con)' : 'var(--hairline)',
  } as CSSProperties;

  return (
    <Modal title="Stake on this argument" onClose={onClose}>
      <div className="stake-amount">
        <span className="stake-amount-label">Balance {formatVotes(tokens)} ⬡</span>
        <span className="stake-amount-inputs">
          <span className="stake-slider">
            <input
              type="range"
              className="stake-range"
              style={trackStyle}
              min={-max}
              max={max}
              step={1}
              value={signed}
              onChange={(event) => setSigned(Number(event.target.value))}
              disabled={busy || tokens < 1}
              aria-label={STAKE_INPUT_LABEL}
            />
            <span className="stake-slider-ends" aria-hidden="true">
              <span className="market-con" title={`Buys bad-argument shares, paying ${BAD_SHARE_PAYOUT} each.`}>
                Overrated ↓
              </span>
              <span className="market-pro" title={`Buys good-argument shares, paying ${GOOD_SHARE_PAYOUT} each.`}>
                Underrated ↑
              </span>
            </span>
          </span>
          <input
            type="number"
            min={-toTokens(tokens)}
            max={toTokens(tokens)}
            step={0.01}
            value={toTokens(signed)}
            onChange={(event) => setSigned(toUnits(Number(event.target.value)))}
            disabled={busy || tokens < 1}
            aria-label={STAKE_INPUT_LABEL}
          />
          ⬡
        </span>
      </div>

      <dl className="detail-facts">
        <dt title={ARGUMENT_RATING_HINT}>Argument rating</dt>
        <dd>
          <Shift before={centered(node.approval)} after={preview ? centered(preview.approval) : null} />
        </dd>
        <dt title={WEIGHTED_RATING_HINT}>Weighted rating</dt>
        <dd>
          <Shift before={before?.rating ?? 0} after={after ? after.rating : null} />
        </dd>
        <dt title={IMPACT_HINT}>Parent impact</dt>
        <dd>
          <Shift before={before?.impact ?? 0} after={after ? after.impact : null} />
        </dd>
        <dt>Fee to the creator</dt>
        <dd className="mono">{preview ? `${formatVotes(preview.fee)} ⬡` : '—'}</dd>
      </dl>

      <button
        type="button"
        className={`btn stake-submit ${side === 'pro' ? 'stake-submit-pro' : side === 'con' ? 'stake-submit-con' : ''}`}
        onClick={() => void stake()}
        disabled={busy || !valid}
      >
        {busy ? (
          'Staking…'
        ) : side === null ? (
          'Move the slider to stake'
        ) : !valid ? (
          `You only have ${formatVotes(tokens)} ⬡ in this debate`
        ) : (
          <>
            Stake {formatVotes(amount)} ⬡ · {side === 'pro' ? 'Underrated' : 'Overrated'} <DirectionArrow side={side} />
          </>
        )}
      </button>
      <p className="composer-hint">
        {tokens < 1
          ? 'You have no vote tokens left in this debate.'
          : 'You profit if the weighted rating corrects your way once the debate finishes. The figures are ' +
            'projection: the tally weighs each price by how long it stood, so a late stake moves them less.'}
      </p>
      {error && <p className="action-error">{error}</p>}
    </Modal>
  );
}
