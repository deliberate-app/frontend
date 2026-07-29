import { PhaseClock } from 'deliberate-frontend';

const NOW = 1_784_700_000;
const nodes = [
  { id: 0, parentId: null, side: null, text: 'School days should start later.', approval: 0.5, weight: 0, state: 'final', finalizationTime: NOW - 9_000 },
];
/** The clock reads the live phase off the schedule, so `now` alone moves it between windows. */
const debateAt = (editingEndTime: number, ratingEndTime: number) => ({
  id: 0,
  phase: 'editing' as const,
  feePercentage: 1,
  nodes,
  timing: { editingEndTime, ratingEndTime, chainTime: NOW, loadedAt: NOW },
});

/** Editing: the countdown runs against the editing deadline. */
export const EditingCountdown = () => (
  <PhaseClock debate={debateAt(NOW + 9_240, NOW + 95_000)} now={NOW} />
);

/** Rating: the editing window has passed, so the countdown rolls to the rating deadline. */
export const RatingCountdown = () => (
  <PhaseClock debate={debateAt(NOW - 600, NOW + 5_415)} now={NOW} />
);

/** Both windows spent: no deadline left to count down, only the pending tally. */
export const AwaitingTally = () => (
  <PhaseClock debate={debateAt(NOW - 86_400, NOW - 120)} now={NOW} />
);
