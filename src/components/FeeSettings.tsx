import { feeError, MAX_FEE_PERCENT } from '../lib/fees';

/** The fee step: what every stake pays the argument's creator. */
export function FeeFields({
  feePercentage,
  onChange,
}: {
  feePercentage: number;
  onChange: (feePercentage: number) => void;
}) {
  const error = feeError(feePercentage);

  return (
    <>
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
        <span className="duration-hint">Paid to the argument's creator on every stake.</span>
      </label>

      {error && <p className="action-error">{error}</p>}
    </>
  );
}
