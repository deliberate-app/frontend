import { useEffect, useRef, type ReactNode } from 'react';
import { DraftControls } from 'deliberate-frontend';

const noop = async () => {};
const TEXT = 'The cited studies cover only a handful of schools.';
const targets = [
  { id: 1, label: 'Teenagers demonstrably learn better after nine.' },
  { id: 2, label: 'Buses and parent schedules cannot absorb a later start.' },
];

/** Presses the control's own trigger, so each mode is reached the way a user reaches it. */
const Pressed = ({ nth, children }: { nth: number; children: ReactNode }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelectorAll('button')[nth]?.click();
  }, [nth]);
  return <div ref={host}>{children}</div>;
};

/** Idle: the two owner-only actions a draft still allows. */
export const Idle = () => (
  <div style={{ maxWidth: 520 }}>
    <DraftControls text={TEXT} currentApproval={62} moveTargets={targets} onEdit={noop} onMove={noop} />
  </div>
);

/** Editing the text: the same composer surface, pre-filled, with the budget counting. */
export const EditingText = () => (
  <Pressed nth={0}>
    <div style={{ maxWidth: 520 }}>
      <DraftControls text={TEXT} currentApproval={62} moveTargets={targets} onEdit={noop} onMove={noop} />
    </div>
  </Pressed>
);

/** Moving: pick a new parent, re-seed the rating; the stance is kept. */
export const MovingBeneath = () => (
  <Pressed nth={1}>
    <div style={{ maxWidth: 520 }}>
      <DraftControls text={TEXT} currentApproval={62} moveTargets={targets} onEdit={noop} onMove={noop} />
    </div>
  </Pressed>
);
