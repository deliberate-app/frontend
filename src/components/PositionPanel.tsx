import { useEffect, useState } from 'react';
import { actionErrorMessage, type ArgumentPosition } from '../data/actions';

/** Post-debate controls for the focused argument: redeem shares, claim creator fees. */
export function PositionPanel({
  argumentId,
  load,
  onRedeem,
  onClaimFees,
}: {
  argumentId: number;
  load: (argumentId: number) => Promise<ArgumentPosition>;
  onRedeem: (argumentId: number) => Promise<void>;
  onClaimFees: (argumentId: number) => Promise<void>;
}) {
  const [position, setPosition] = useState<ArgumentPosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPosition(null);
    load(argumentId)
      .then((loaded) => {
        if (!cancelled) setPosition(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(actionErrorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [argumentId, load]);

  if (!position) {
    return error ? <p className="action-error">{error}</p> : null;
  }

  const run = async (action: (argumentId: number) => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action(argumentId);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const hasShares = position.proShares > 0 || position.conShares > 0;
  if (!hasShares && position.claimableFees === 0) {
    return null;
  }

  return (
    <div className="action-panel">
      <div className="action-row">
        {hasShares && (
          <>
            <span className="action-hint">
              Your shares:{' '}
              <strong className="mono">
                {position.proShares} pro · {position.conShares} con
              </strong>
            </span>
            <button type="button" className="btn btn-solid" onClick={() => run(onRedeem)} disabled={busy}>
              {busy ? 'Redeeming…' : 'Redeem shares'}
            </button>
          </>
        )}
        {position.claimableFees > 0 && (
          <button type="button" className="btn" onClick={() => run(onClaimFees)} disabled={busy}>
            Claim {position.claimableFees} ⬡ creator fees
          </button>
        )}
      </div>
      {error && <p className="action-error">{error}</p>}
    </div>
  );
}
