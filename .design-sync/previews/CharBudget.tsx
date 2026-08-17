import { CharBudget } from 'deliberate-frontend';

/** The composer footer row it lives in: actions left, the budget trailing. */
export const InComposerRow = () => (
  <div className="action-row" style={{ width: 360 }}>
    <button type="button" className="btn btn-primary">
      Add argument
    </button>
    <button type="button" className="btn">
      Cancel
    </button>
    <CharBudget length={87} />
  </div>
);

/** Empty and full: the counter is the only cue for the 250-character cap. */
export const EmptyAndFull = () => (
  <span style={{ display: 'inline-flex', gap: '1.5rem' }}>
    <CharBudget length={0} />
    <CharBudget length={250} />
  </span>
);
