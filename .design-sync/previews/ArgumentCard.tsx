import { ArgumentCard } from 'deliberate-frontend';

const NOW = 1_784_700_000;
const timing = { editingEndTime: NOW + 43_200, ratingEndTime: NOW + 86_400, chainTime: NOW, loadedAt: NOW };
const nodes = [
  { id: 0, parentId: null, side: null, text: 'School days should start later.', approval: 0.5, weight: 0, state: 'final', finalizationTime: NOW - 9_000 },
  { id: 1, parentId: 0, side: 'pro', text: 'Teenagers demonstrably learn better after nine.', approval: 0.82, proReserve: 22, conReserve: 98, weight: 120, state: 'final', finalizationTime: NOW - 3_600, creator: '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9' },
  { id: 2, parentId: 0, side: 'con', text: 'Buses and parent schedules cannot absorb a later start.', approval: 0.31, proReserve: 45, conReserve: 20, weight: 65, state: 'final', finalizationTime: NOW - 3_000 },
  { id: 3, parentId: 1, side: 'con', text: 'The cited studies cover only a handful of schools.', approval: 0.5, proReserve: 5, conReserve: 5, weight: 10, state: 'created', finalizationTime: NOW + 900 },
];
const debate = { id: 0, phase: 'rating', feePercentage: 1, nodes, timing };
const noop = () => {};

/** Undebated: nothing has corrected the market, so Market and Rating agree and it lifts its parent. */
export const BackedPro = () => (
  <div style={{ maxWidth: 360 }}>
    <ArgumentCard debate={debate} node={nodes[1]} tally={{ rating: 0.64, impact: 0.61, subtreeWeight: 120 }} now={NOW} onFocus={noop} />
  </div>
);

/** The pair parting: a market that likes the argument, a sub-debate that overrules it to refuted -
    so it moves its parent by nothing at all. The `total` stake appears here and only here, because
    only here has a sub-debate added to the argument's own - so only here does the Rating figure
    carry a stake in parentheses of its own. */
export const OverruledByItsSubDebate = () => (
  <div style={{ maxWidth: 360 }}>
    <ArgumentCard debate={debate} node={nodes[1]} tally={{ rating: -0.3, impact: 0, subtreeWeight: 190 }} now={NOW} onFocus={noop} />
  </div>
);

/** A rejected con argument: rust contour, both figures below neutral, pulling its parent down. */
export const RejectedCon = () => (
  <div style={{ maxWidth: 360 }}>
    <ArgumentCard debate={debate} node={nodes[2]} tally={{ rating: -0.38, impact: -0.12, subtreeWeight: 65 }} now={NOW} onFocus={noop} />
  </div>
);

/** A draft still inside its locking window: open padlock with the countdown, and no figures but
    its own market - a draft is not counted until it locks in. */
export const DraftCountingDown = () => (
  <div style={{ maxWidth: 360 }}>
    <ArgumentCard debate={debate} node={nodes[3]} now={NOW} onFocus={noop} />
  </div>
);
