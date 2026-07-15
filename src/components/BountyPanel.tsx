import { useState } from 'react';
import { actionErrorMessage } from '../data/actions';
import { formatDuration } from '../lib/time';
import { formatTokenAmount, parseTokenAmount } from '../lib/tokens';
import type { Debate } from '../types';
import { liveChainTime } from '../types';
import type { DebateTx } from './DebateView';

/**
 * The bounty affordances beneath the thesis: a top-up while the debate runs, the settle-and-claim
 * once it is finished (one transaction: redeem the account's positions, collect its authored
 * arguments' fees, then claim the bounty share), and the creator's sweep after the claim window.
 */
export function BountyPanel({ debate, tx, now }: { debate: Debate; tx: DebateTx | null; now: number }) {
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bounty = debate.bounty;
  if (!bounty || tx === null) {
    return null;
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  // The chain clock decides whether the claim window is still open (sample data has none).
  const chainNow = debate.timing ? liveChainTime(debate.timing, now) : now;

  if (debate.phase !== 'finished') {
    // Running: anyone may top up the pool; top-ups are donations.
    return (
      <div className="bounty-panel">
        <span className="action-hint">
          Bounty <strong className="mono">{formatTokenAmount(bounty.pool, bounty)}</strong> for the
          debate&apos;s net winners.
        </span>
        <span className="bounty-topup">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            aria-label={`Top-up amount in ${bounty.symbol}`}
          />
          <button
            type="button"
            className="btn btn-small"
            disabled={busy || amountText.trim() === ''}
            title="Top-ups are donations: they raise every claim and are not refundable."
            onClick={() =>
              void run(async () => {
                await tx.fundBounty(parseTokenAmount(amountText, bounty.decimals));
                setAmountText('');
              })
            }
          >
            {busy ? 'Topping up…' : `Top up ${bounty.symbol}`}
          </button>
        </span>
        {error && <p className="action-error">{error}</p>}
      </div>
    );
  }

  // Finished: claims within the window, the creator's sweep after it.
  const windowOpen = bounty.claimEndTime > 0 && chainNow <= bounty.claimEndTime;
  const isCreator = tx.account.toLowerCase() === (thesisCreatorOf(debate) ?? '').toLowerCase();
  const remainder = bounty.pool - bounty.claimed;

  const claim = () =>
    run(async () => {
      // Settle-and-claim: the account's share positions plus its authored arguments (their
      // fees), so the excess is complete before the one-shot claim.
      const positions = await tx.loadPositions();
      const authored = debate.nodes
        .filter((node) => node.creator?.toLowerCase() === tx.account.toLowerCase() && node.parentId !== null)
        .map((node) => node.id);
      const ids = [...new Set([...positions.map((position) => position.argumentId), ...authored])];
      // The awaited refresh flips tx.bountyClaimed, which renders the claimed state.
      await tx.claimBounty(ids);
    });

  return (
    <div className="bounty-panel">
      <span className="action-hint">
        Bounty <strong className="mono">{formatTokenAmount(bounty.pool, bounty)}</strong>
        {bounty.claimed > 0n && <> · claimed {formatTokenAmount(bounty.claimed, bounty)}</>}
        {bounty.swept
          ? ' · remainder swept'
          : windowOpen
            ? ` · claims close in ${formatDuration(Math.max(0, bounty.claimEndTime - chainNow))}`
            : ' · claims closed'}
      </span>
      {windowOpen && tx.joined && !tx.bountyClaimed && (
        <button
          type="button"
          className="btn btn-solid"
          disabled={busy}
          title="One transaction: redeem your shares, collect your arguments' fees, then claim your share - one-shot."
          onClick={() => void claim()}
        >
          {busy ? 'Claiming…' : 'Redeem & claim bounty share'}
        </button>
      )}
      {tx.bountyClaimed && <span className="action-hint">Your share is claimed.</span>}
      {!windowOpen && isCreator && !bounty.swept && remainder > 0n && (
        <button type="button" className="btn btn-solid" disabled={busy} onClick={() => void run(() => tx.sweepBounty())}>
          {busy ? 'Sweeping…' : `Sweep ${formatTokenAmount(remainder, bounty)}`}
        </button>
      )}
      {error && <p className="action-error">{error}</p>}
    </div>
  );
}

/** The debate creator: the thesis' creator. */
function thesisCreatorOf(debate: Debate): string | undefined {
  return debate.nodes.find((node) => node.parentId === null)?.creator;
}
