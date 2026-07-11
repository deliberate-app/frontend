import { formatClockTime, formatDuration } from '../lib/time';
import type { Debate } from '../types';

/**
 * The debate's phase clock: the running deadline as a live countdown, the full
 * schedule (editing and rating end, in local time) on hover.
 */
export function PhaseClock({ debate, now }: { debate: Debate; now: number }) {
  const { timing, phase } = debate;
  if (!timing || phase === 'finished') return null;

  // The chain head can run ahead of the wall clock on time-warped dev chains.
  const time = Math.max(now, timing.chainTime);
  const schedule = `Editing until ${formatClockTime(timing.editingEndTime)} · rating until ${formatClockTime(timing.ratingEndTime)}`;

  const deadline =
    phase === 'editing' ? timing.editingEndTime : phase === 'rating' ? timing.ratingEndTime : null;
  const text =
    deadline === null
      ? 'awaiting the tally'
      : time < deadline
        ? `ends in ${formatDuration(deadline - time)}`
        : 'time is up';

  return (
    <span className="phase-clock" title={schedule}>
      {text}
    </span>
  );
}
