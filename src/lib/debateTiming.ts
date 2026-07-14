/** The three creator-chosen times shaping a debate, in seconds. */
export interface DebateSchedule {
  /** The draft window: how long a new or edited argument stays editable before it locks in. */
  timeUnit: number;
  /** The length of the editing phase, in which arguments are added and revised. */
  editingDuration: number;
  /** The length of the rating phase, in which participants stake on the argument markets. */
  ratingDuration: number;
}

/** Drafts locked longer than this hold up the replies beneath them; UI guidance, not a contract rule. */
export const DRAFT_WINDOW_GUIDANCE = 30 * 60;

/** The named schedules offered in the settings. */
export const SCHEDULE_PRESETS: ReadonlyArray<{ name: string; schedule: DebateSchedule }> = [
  { name: 'Demo', schedule: { timeUnit: 60, editingDuration: 10 * 60, ratingDuration: 5 * 60 } },
  { name: 'Sprint', schedule: { timeUnit: 5 * 60, editingDuration: 60 * 60, ratingDuration: 30 * 60 } },
  { name: 'Day', schedule: { timeUnit: 30 * 60, editingDuration: 24 * 60 * 60, ratingDuration: 12 * 60 * 60 } },
  {
    name: 'Week',
    schedule: { timeUnit: 30 * 60, editingDuration: 5 * 24 * 60 * 60, ratingDuration: 2 * 24 * 60 * 60 },
  },
];

/**
 * The schedule applied without ever opening the settings: quick 30-minute draft locks (so replies are
 * never held up for long) inside a day of editing (48 lock-in windows - room for deeply nested
 * arguments) and half a day of rating.
 */
export const DEFAULT_SCHEDULE: DebateSchedule = SCHEDULE_PRESETS[2].schedule;

/** The classic single-knob split used by tests and seed scripts: editing spans seven draft windows, rating three. */
export function classicSchedule(timeUnit: number): DebateSchedule {
  return { timeUnit, editingDuration: 7 * timeUnit, ratingDuration: 3 * timeUnit };
}

/** Mirrors the contract's createDebate checks; null when the schedule is accepted on-chain. */
export function scheduleError(schedule: DebateSchedule): string | null {
  const { timeUnit, editingDuration, ratingDuration } = schedule;
  if (!Number.isInteger(timeUnit) || !Number.isInteger(editingDuration) || !Number.isInteger(ratingDuration)) {
    return 'Durations must be whole seconds.';
  }
  if (timeUnit <= 0) {
    return 'Drafts must take some time to lock in.';
  }
  if (editingDuration < timeUnit) {
    return 'The editing phase must fit at least one draft window, so arguments can lock in and be replied to.';
  }
  if (ratingDuration < timeUnit) {
    return 'The rating phase must fit at least one draft window, so every argument is final when the tally runs.';
  }
  return null;
}

/** Soft guidance on a valid schedule; null when nothing is worth flagging. */
export function scheduleWarning(schedule: DebateSchedule): string | null {
  if (schedule.timeUnit > DRAFT_WINDOW_GUIDANCE) {
    return 'Drafts this long keep others from replying beneath a new argument - 30 minutes or less is recommended.';
  }
  const levels = Math.floor(schedule.editingDuration / schedule.timeUnit);
  if (levels < 3) {
    return `Only ${levels} draft window${levels === 1 ? ' fits' : 's fit'} into the editing phase, capping the tree at ${levels} nested level${levels === 1 ? '' : 's'}.`;
  }
  return null;
}

/** Whether two schedules are identical, for highlighting the active preset. */
export function sameSchedule(a: DebateSchedule, b: DebateSchedule): boolean {
  return (
    a.timeUnit === b.timeUnit &&
    a.editingDuration === b.editingDuration &&
    a.ratingDuration === b.ratingDuration
  );
}
