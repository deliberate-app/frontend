import { useEffect, useRef, type ReactNode } from 'react';
import { Composer } from 'deliberate-frontend';

const noop = async () => {};

/** Drives the composer into its open state through its own trigger - no state is faked. */
const Opened = ({ children }: { children: ReactNode }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelector('button')?.click();
  }, []);
  return <div ref={host}>{children}</div>;
};

/** Closed: the one-line invitation that names the stance and the minimum stake. */
export const ClosedPro = () => (
  <div style={{ maxWidth: 520 }}>
    <Composer side="pro" tokens={100} onAdd={noop} />
  </div>
);

/** The open form: text, the initial-approval slider, the stake, and the character budget. */
export const OpenForm = () => (
  <Opened>
    <div style={{ maxWidth: 520 }}>
      <Composer side="con" tokens={100} onAdd={noop} />
    </div>
  </Opened>
);

/** Below the 10 ⬡ minimum the trigger is disabled - the debate balance cannot cover an argument. */
export const CannotAfford = () => (
  <div style={{ maxWidth: 520 }}>
    <Composer side="pro" tokens={4} onAdd={noop} />
  </div>
);
