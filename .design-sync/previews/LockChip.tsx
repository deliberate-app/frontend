import { LockChip } from 'deliberate-frontend';

/** A draft inside its locking window: open shackle with the countdown running beside it. */
export const DraftCountingDown = () => (
  <p className="focus-meta">
    weight <strong className="mono">10 ⬡</strong> · <LockChip locked={false} finalizesIn={742} />
  </p>
);

/** Final: the shackle closes and the countdown is gone - no more edits or moves. */
export const LockedIn = () => (
  <p className="focus-meta">
    weight <strong className="mono">120 ⬡</strong> · <LockChip locked finalizesIn={null} />
  </p>
);

/** Both states enlarged, so the shackle reads: ajar while a draft, closed once final. */
export const BothStates = () => (
  <span style={{ display: 'inline-flex', gap: '2rem', alignItems: 'center', fontSize: '1.75rem' }}>
    <LockChip locked={false} finalizesIn={58} />
    <LockChip locked finalizesIn={null} />
  </span>
);
