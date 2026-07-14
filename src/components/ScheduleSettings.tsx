import {
  DEFAULT_SCHEDULE,
  SCHEDULE_PRESETS,
  sameSchedule,
  scheduleError,
  scheduleWarning,
  type DebateSchedule,
} from '../lib/debateTiming';

const UNITS = [
  { label: 'min', seconds: 60 },
  { label: 'hours', seconds: 3_600 },
  { label: 'days', seconds: 86_400 },
];

/** The largest unit expressing the value without fractions, for a clean reading. */
const bestUnit = (seconds: number) =>
  UNITS.reduce((best, unit) => (seconds % unit.seconds === 0 ? unit.seconds : best), UNITS[0].seconds);

function DurationField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  /** The duration in seconds. */
  value: number;
  onChange: (seconds: number) => void;
}) {
  const unit = bestUnit(value);
  const amount = value / unit;
  return (
    <label className="duration-field">
      <span className="duration-label">{label}</span>
      <span className="duration-inputs">
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(event) => onChange(Math.round(Number(event.target.value) * unit))}
        />
        <select
          value={unit}
          onChange={(event) => onChange(Math.round(amount * Number(event.target.value)))}
        >
          {UNITS.map(({ label: unitLabel, seconds }) => (
            <option key={unitLabel} value={seconds}>
              {unitLabel}
            </option>
          ))}
        </select>
      </span>
      <span className="duration-hint">{hint}</span>
    </label>
  );
}

/**
 * The cogwheel modal tuning a debate's schedule before creation: presets for the common cases, free
 * durations for everything else, with the contract's rules enforced and softer guidance surfaced.
 */
export function ScheduleSettings({
  schedule,
  onChange,
  onClose,
}: {
  schedule: DebateSchedule;
  onChange: (schedule: DebateSchedule) => void;
  onClose: () => void;
}) {
  const error = scheduleError(schedule);
  const warning = error === null ? scheduleWarning(schedule) : null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Debate schedule"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Debate schedule</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="preset-row">
          {SCHEDULE_PRESETS.map(({ name, schedule: preset }) => (
            <button
              key={name}
              type="button"
              className={`btn btn-small ${sameSchedule(preset, schedule) ? 'preset-active' : ''}`}
              onClick={() => onChange({ ...preset })}
            >
              {name}
            </button>
          ))}
        </div>

        <DurationField
          label="Drafts lock in"
          hint="How long a new or edited argument stays editable and movable. Nobody can reply beneath it until it locks in, so 30 minutes or less keeps the tree growing."
          value={schedule.timeUnit}
          onChange={(timeUnit) => onChange({ ...schedule, timeUnit })}
        />
        <DurationField
          label="Editing phase"
          hint="How long arguments can be added and revised. Every nesting level needs one draft window to lock in first, so this bounds the tree's depth."
          value={schedule.editingDuration}
          onChange={(editingDuration) => onChange({ ...schedule, editingDuration })}
        />
        <DurationField
          label="Rating phase"
          hint="How long participants can read the debate and stake on over- and underrated arguments."
          value={schedule.ratingDuration}
          onChange={(ratingDuration) => onChange({ ...schedule, ratingDuration })}
        />

        {error && <p className="action-error">{error}</p>}
        {warning && <p className="schedule-warning">{warning}</p>}

        <div className="action-row">
          <button type="button" className="btn" onClick={() => onChange({ ...DEFAULT_SCHEDULE })}>
            Reset to default
          </button>
          <button type="button" className="btn btn-solid" onClick={onClose} disabled={error !== null}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
