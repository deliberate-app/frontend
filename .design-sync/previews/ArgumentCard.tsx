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

/** A well-backed pro argument: green contour, diverging gauge right, positive impact on its parent. */
export const BackedPro = () => (
  <div style={{ maxWidth: 360 }}>
    <ArgumentCard debate={debate} node={nodes[1]} impact={0.61} now={NOW} onFocus={noop} />
  </div>
);

/** A rejected con argument: rust contour, gauge diverging left, negative impact on its parent. */
export const RejectedCon = () => (
  <div style={{ maxWidth: 360 }}>
    <ArgumentCard debate={debate} node={nodes[2]} impact={-0.12} now={NOW} onFocus={noop} />
  </div>
);

/** A draft still inside its locking window: open padlock with the countdown, no impact yet. */
export const DraftCountingDown = () => (
  <div style={{ maxWidth: 360 }}>
    <ArgumentCard debate={debate} node={nodes[3]} now={NOW} onFocus={noop} />
  </div>
);
