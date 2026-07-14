/** The three creator-chosen times shaping a debate, in seconds. */
export interface DebateSchedule {
  /** How long a new or edited argument stays an editable draft before it locks in. */
  lockingDuration: number;
  /** The length of the editing phase, in which arguments are added and revised. */
  editingDuration: number;
  /** The length of the rating phase, in which participants stake on the argument markets. */
  ratingDuration: number;
}

/** Editing should fit this many locking windows, so arguments can be nested and moved into place. */
export const NESTING_GUIDANCE = 5;

/**
 * The schedule applied without ever opening the settings: quick 30-minute locking (so replies are
 * never held up for long) inside a day of editing (48 locking windows - room for deeply nested
 * arguments) and half a day of rating.
 */
export const DEFAULT_SCHEDULE: DebateSchedule = {
  lockingDuration: 30 * 60,
  editingDuration: 24 * 60 * 60,
  ratingDuration: 12 * 60 * 60,
};

/** The named schedules offered in the settings: one duration axis around the default. */
export const SCHEDULE_PRESETS: ReadonlyArray<{ name: string; schedule: DebateSchedule }> = [
  { name: 'Short', schedule: { lockingDuration: 5 * 60, editingDuration: 60 * 60, ratingDuration: 30 * 60 } },
  { name: 'Default', schedule: DEFAULT_SCHEDULE },
  {
    name: 'Long',
    schedule: { lockingDuration: 60 * 60, editingDuration: 5 * 24 * 60 * 60, ratingDuration: 2 * 24 * 60 * 60 },
  },
];

/** The classic single-knob split used by tests and seed scripts: editing spans seven locking windows, rating three. */
export function classicSchedule(lockingDuration: number): DebateSchedule {
  return { lockingDuration, editingDuration: 7 * lockingDuration, ratingDuration: 3 * lockingDuration };
}

/** Mirrors the contract's createDebate checks; null when the schedule is accepted on-chain. */
export function scheduleError(schedule: DebateSchedule): string | null {
  const { lockingDuration, editingDuration, ratingDuration } = schedule;
  if (!Number.isInteger(lockingDuration) || !Number.isInteger(editingDuration) || !Number.isInteger(ratingDuration)) {
    return 'Durations must be whole seconds.';
  }
  if (lockingDuration <= 0) {
    return 'Locking needs a duration.';
  }
  if (editingDuration <= lockingDuration) {
    return 'The editing phase must be longer than the locking duration.';
  }
  if (ratingDuration < lockingDuration) {
    return 'The rating phase must fit at least one locking window.';
  }
  return null;
}

/** Soft guidance on a valid schedule; null when nothing is worth flagging. */
export function scheduleWarning(schedule: DebateSchedule): string | null {
  if (schedule.editingDuration < NESTING_GUIDANCE * schedule.lockingDuration) {
    return 'Editing under five locking windows leaves little room to nest and move arguments.';
  }
  if (schedule.ratingDuration * 4 < schedule.editingDuration) {
    return 'Rating far shorter than editing leaves little time to read and rate.';
  }
  return null;
}

/** Whether two schedules are identical, for highlighting the active preset. */
export function sameSchedule(a: DebateSchedule, b: DebateSchedule): boolean {
  return (
    a.lockingDuration === b.lockingDuration &&
    a.editingDuration === b.editingDuration &&
    a.ratingDuration === b.ratingDuration
  );
}
