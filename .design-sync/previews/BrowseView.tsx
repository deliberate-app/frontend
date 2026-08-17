import { useEffect, useRef, type ReactNode } from 'react';
import { BrowseView } from 'deliberate-frontend';

const noop = () => {};
const noopAsync = async () => {};

const eurc = {
  token: '0x808456652fdb597867f38412077A9182bf77359F',
  symbol: 'EURC',
  decimals: 6,
  pool: 2_000_000n,
  claimed: 0n,
  swept: false,
  claimEndTime: 0,
};

const debates = [
  {
    id: 4,
    thesis: 'School days should start later.',
    phase: 'rating' as const,
    stake: 191,
    argumentsCount: 6,
    bounty: eurc,
    creator: '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9',
  },
  {
    id: 3,
    thesis: 'Cities should price street parking at market rates.',
    phase: 'editing' as const,
    stake: 64,
    argumentsCount: 3,
    creator: '0x990c8E1B70Ee0b0B4bE9D8B5F0f3aD8f9d0B27a1',
  },
  {
    id: 2,
    thesis: 'Public research funding should favour replication studies.',
    phase: 'finished' as const,
    approved: true,
    stake: 420,
    argumentsCount: 11,
    bounty: { ...eurc, pool: 50_000_000n, claimed: 31_000_000n },
    creator: '0x6f71c01803b8B7960a0B145E574ED210C8fF2513',
  },
  {
    id: 1,
    thesis: 'Remote work makes teams less innovative.',
    phase: 'finished' as const,
    approved: false,
    stake: 118,
    argumentsCount: 8,
    creator: '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9',
  },
];

const filter = { status: 'all' as const, thesis: '', author: '', sort: 'recent' as const };

const props = {
  debates,
  account: '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9',
  filter,
  onFilter: noop,
  createDisabledHint: null,
  onOpen: noop,
  onCreate: noopAsync,
};

const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ width: 1060, position: 'relative' }}>{children}</div>
);

/** Presses the create trigger so the authoring form and its settings chips are visible. */
const Opened = ({ children }: { children: ReactNode }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelector('button')?.click();
  }, []);
  return <div ref={host}>{children}</div>;
};

/** The browse list: the create affordance, the filter row, and one row per debate. */
export const Default = () => (
  <Frame>
    <BrowseView {...props} />
  </Frame>
);

/** The create form open: thesis field, the schedule / fee / bounty chips, the character budget. */
export const CreatingADebate = () => (
  <Frame>
    <Opened>
      <BrowseView {...props} />
    </Opened>
  </Frame>
);

/** Filtered to finished debates and sorted by bounty - the verdict marks line up in their slot. */
export const FilteredToFinished = () => (
  <Frame>
    <BrowseView {...props} filter={{ ...filter, status: 'finished', sort: 'bounty' }} />
  </Frame>
);

/** Nothing yet: the empty state invites the first debate rather than showing a bare list. */
export const Empty = () => (
  <Frame>
    <BrowseView {...props} debates={[]} />
  </Frame>
);

/** No wallet: creating is disabled and the trigger explains why on hover. */
export const CannotCreate = () => (
  <Frame>
    <BrowseView {...props} account={undefined} createDisabledHint="Connect a wallet to start a debate" />
  </Frame>
);
