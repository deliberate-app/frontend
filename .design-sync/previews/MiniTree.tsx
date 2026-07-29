import { MiniTree } from 'deliberate-frontend';

const NOW = 1_784_700_000;
const node = (id: number, parentId: number | null, side: 'pro' | 'con' | null, text: string) => ({
  id,
  parentId,
  side,
  text,
  approval: 0.5,
  weight: 20,
  state: 'final' as const,
  finalizationTime: NOW - 3_600,
});

const nodes = [
  node(0, null, null, 'School days should start later.'),
  node(1, 0, 'pro', 'Teenagers demonstrably learn better after nine.'),
  node(2, 0, 'pro', 'Later starts cut morning traffic.'),
  node(3, 0, 'con', 'Buses and parent schedules cannot absorb a later start.'),
  node(4, 1, 'pro', 'Three districts replicated the finding.'),
  node(5, 1, 'con', 'The cited studies cover only a handful of schools.'),
  node(6, 3, 'pro', 'Rural routes share buses across two schools.'),
  node(7, 3, 'con', 'Two districts re-timed routes without extra cost.'),
  node(8, 5, 'con', 'The replication covers 40 schools.'),
];
const debate = { id: 0, phase: 'rating' as const, feePercentage: 1, nodes };
const noop = () => {};

/** Focus deep in the tree: the ancestry fills, the focus's own children stay outlined, the rest fades. */
export const FocusedBranch = () => <MiniTree debate={debate} focusedId={5} onFocus={noop} />;

/** Focus on the thesis: its children are the context tier, every deeper node fades. */
export const FocusedThesis = () => <MiniTree debate={debate} focusedId={0} onFocus={noop} />;

/** A leaf in focus - the filled path runs the full depth of the map. */
export const FocusedLeaf = () => <MiniTree debate={debate} focusedId={8} onFocus={noop} />;
