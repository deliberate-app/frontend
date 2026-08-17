import { useEffect, useRef, type ReactNode } from 'react';
import { StakeModal } from 'deliberate-frontend';

const noop = async () => {};
const close = () => {};

/** A transform-containing frame anchors the modal's fixed backdrop inside the card. */
const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ transform: 'translateZ(0)', width: 540, height: 430, position: 'relative' }}>{children}</div>
);

/**
 * Moves the modal's own slider, the way a reader would: the native value setter plus an `input`
 * event, so React sees the change and the preview shows a real state, not a faked one.
 */
const Slid = ({ to, children }: { to: number; children: ReactNode }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const range = host.current?.querySelector<HTMLInputElement>('input[type="range"]');
    if (!range) return;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(range, String(to));
    range.dispatchEvent(new Event('input', { bubbles: true }));
  }, [to]);
  return (
    <div ref={host} style={{ display: 'contents' }}>
      {children}
    </div>
  );
};

const node = {
  id: 1,
  parentId: 0,
  side: 'con' as const,
  text: 'Silence usually means nobody was listening, not that the claim is strong.',
  approval: 0.8,
  proReserve: 6,
  conReserve: 24,
  weight: 30,
  rating: null,
  state: 'final' as const,
  finalizationTime: 1_784_690_000,
};

const debate = {
  id: 1,
  phase: 'rating' as const,
  feePercentage: 5,
  nodes: [
    {
      id: 0,
      parentId: null,
      side: null,
      text: 'An argument should be judged by the objections it survives.',
      approval: 0.5,
      weight: 0,
      rating: null,
      state: 'final' as const,
      finalizationTime: 1_784_600_000,
    },
    node,
  ],
};

/** At rest the slider sits at the neutral centre and the button asks for a direction. */
export const NoDirectionYet = () => (
  <Frame>
    <StakeModal debate={debate} node={node} tokens={100} onStake={noop} onClose={close} />
  </Frame>
);

/** Right of centre: good-argument shares, the button green, and the preview reading up. */
export const Underrated = () => (
  <Frame>
    <Slid to={25}>
      <StakeModal debate={debate} node={node} tokens={100} onStake={noop} onClose={close} />
    </Slid>
  </Frame>
);

/** Left of centre: bad-argument shares, the button rust, and the market pushed below neutral. */
export const Overrated = () => (
  <Frame>
    <Slid to={-40}>
      <StakeModal debate={debate} node={node} tokens={100} onStake={noop} onClose={close} />
    </Slid>
  </Frame>
);

/** A thin balance: the slider's whole range is the six tokens the participant still holds. */
export const AlmostSpent = () => (
  <Frame>
    <Slid to={-4}>
      <StakeModal debate={debate} node={node} tokens={6} onStake={noop} onClose={close} />
    </Slid>
  </Frame>
);
