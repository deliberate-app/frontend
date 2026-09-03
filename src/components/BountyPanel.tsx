import { useState } from 'react';
import { Modal } from './Modal';
import { actionErrorMessage } from '../data/actions';
import { formatDuration } from '../lib/time';
import { formatTokenAmount, parseTokenAmount } from '../lib/tokens';
import type { Debate } from '../types';
import { liveChainTime } from '../types';
import type { DebateTx } from './DebateView';

/**
 * The bounty figure in the thesis meta, and - while the debate runs and a wallet is connected -
 * the top-up affordance on it: the chip opens a small transactional modal (an irreversible
 * donation wants an explicit confirm, unlike live-editing settings).
 */
export function BountyTopUpChip({ debate, tx }: { debate: Debate; tx: DebateTx | null }) {
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bounty = debate.bounty;
  if (!bounty) {
    return null;
  }
  const pool = <strong className="mono">{formatTokenAmount(bounty.pool, bounty)}</strong>;
  // Read-only without a wallet, and once finished (the claim panel owns the bounty from there).
  if (tx === null || debate.phase === 'finished') {
    return <>bounty {pool}</>;
  }

  const close = () => {
    if (!busy) {
      setOpen(false);
      setError(null);
    }
  };
  const topUp = async () => {
    setBusy(true);
    setError(null);
    try {
      await tx.fundBounty(parseTokenAmount(amountText, bounty.decimals));
      setAmountText('');
      setOpen(false);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      bounty {pool}{' '}
      <button
        type="button"
        className="round-chip"
        title="Top up the bounty"
        aria-label="Top up the bounty"
        onClick={() => setOpen(true)}
      >
        <svg className="chip-glyph" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.75 V12.25 M3.75 8 H12.25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>
      </button>
      {open && (
        <Modal title="Top up the bounty" onClose={close}>
          <p className="composer-hint">
            The bounty - currently <strong className="mono">{formatTokenAmount(bounty.pool, bounty)}</strong> -
            pays participants who end with more vote tokens than they were granted, once the debate
            finishes. Top-ups are donations: they raise every claim and are not refundable.
          </p>
          <label className="duration-field">
            <span className="duration-label">Amount</span>
            <span className="duration-inputs">
              <input
                className="mono"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                aria-label={`Top-up amount in ${bounty.symbol}`}
              />
              <span className="duration-unit-label">{bounty.symbol}</span>
            </span>
          </label>
          <button
            type="button"
            className="btn btn-solid"
            disabled={busy || amountText.trim() === ''}
            onClick={() => void topUp()}
          >
            {busy ? 'Topping up…' : `Top up ${bounty.symbol}`}
          </button>
          {error && <p className="action-error">{error}</p>}
        </Modal>
      )}
    </>
  );
}

/**
 * The bounty actions beneath a finished thesis: settle-and-claim within the window (one
 * transaction: redeem the account's positions, collect its authored arguments' fees, then
 * claim the bounty share), and the creator's sweep after it.
 */
export function BountyPanel({ debate, tx, now }: { debate: Debate; tx: DebateTx | null; now: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bounty = debate.bounty;
  if (!bounty || tx === null || debate.phase !== 'finished') {
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
          title="One transaction, once - it also redeems your shares and claims your fees."
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
