import { formatCountdown } from '../lib/time';

/** A small monochrome padlock: shackle open (ajar) while a draft can still change, closed once it locks in. */
function LockIcon({ open }: { open: boolean }) {
  return (
    <svg className="lock-icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect className="lock-body" x="3" y="7" width="10" height="6.5" rx="1.5" />
      <path className="lock-shackle" d={open ? 'M5.2 7V5a2.8 2.8 0 0 1 5.6 0' : 'M5.2 7V5a2.8 2.8 0 0 1 5.6 0V7'} />
    </svg>
  );
}

/** The lock state of an argument: a counting-down open padlock while a draft, a muted closed one once final. */
export function LockChip({
  locked,
  finalizesIn,
}: {
  locked: boolean;
  /** Seconds until the draft locks in; null without a chain clock (sample data). */
  finalizesIn: number | null;
}) {
  return (
    <span
      className={`card-lock ${locked ? 'card-lock-locked' : 'card-lock-draft'}`}
      title={
        locked
          ? 'Locked in - final and tradeable'
          : 'Draft: editable and movable until it locks in, then final automatically'
      }
    >
      {!locked && finalizesIn !== null && <span className="card-lock-time">{formatCountdown(finalizesIn)}</span>}
      <LockIcon open={!locked} />
    </span>
  );
}
