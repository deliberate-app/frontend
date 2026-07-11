import { useState } from 'react';
import { actionErrorMessage } from '../data/actions';
import { formatDuration } from '../lib/time';

/**
 * The finalize poke for a focused draft argument. Finalizing is permissionless:
 * once the argument's editing window has passed, anyone may lock it in, giving
 * it a tradeable market and a place in the tally.
 */
export function FinalizePanel({
  eligible,
  opensIn,
  onFinalize,
}: {
  eligible: boolean;
  /** Seconds until the finalize gate opens; undefined without a chain clock (sample data). */
  opensIn?: number;
  onFinalize: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalize = async () => {
    setBusy(true);
    setError(null);
    try {
      await onFinalize();
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="action-panel">
      <div className="action-row">
        <span className="action-hint">
          {eligible
            ? 'This draft can be locked in - anyone may finalize it.'
            : `This argument is a draft: still editable, not yet tradeable.${
                opensIn !== undefined && opensIn > 0
                  ? ` It can be finalized in ${formatDuration(opensIn)}.`
                  : ''
              }`}
        </span>
        {eligible && (
          <button type="button" className="btn btn-solid" onClick={finalize} disabled={busy}>
            {busy ? 'Finalizing…' : 'Finalize argument'}
          </button>
        )}
      </div>
      {error && <p className="action-error">{error}</p>}
    </div>
  );
}
