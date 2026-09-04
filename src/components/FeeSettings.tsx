import { Modal } from './Modal';
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
    <Modal title="Market fee" onClose={onClose}>
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
          Taken from every stake and paid to the argument's creator: their revenue, and the threshold a mispricing must
          exceed to be worth staking against.
        </span>
      </label>

      {error && <p className="action-error">{error}</p>}
    </Modal>
  );
}
