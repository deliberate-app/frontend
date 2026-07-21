import { feeError, MAX_FEE_PERCENT } from '../lib/fees';

/**
 * The cogwheel modal tuning a debate's market fee before creation. Edits apply live - the
 * summary chip behind the modal updates as the value changes - so closing (the cross or the
 * backdrop) is the only exit, and an invalid fee keeps the create button disabled.
 */
export function FeeSettings({
  feePercentage,
  onChange,
  onClose,
}: {
  feePercentage: number;
  onChange: (feePercentage: number) => void;
  onClose: () => void;
}) {
  const error = feeError(feePercentage);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Market fee"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Market fee</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="duration-field">
          <span className="duration-label">Fee</span>
          <span className="duration-inputs">
            <input
              type="number"
              min={0}
              max={MAX_FEE_PERCENT}
              step={1}
              value={feePercentage}
              onChange={(event) => onChange(Number(event.target.value))}
            />
            <span className="duration-unit-label">%</span>
          </span>
          <span className="duration-hint">
            Taken from every stake and accrued to the staked argument's creator - author revenue,
            and the threshold a mispricing must exceed to be worth correcting.
          </span>
        </label>

        {error && <p className="action-error">{error}</p>}
      </div>
    </div>
  );
}
