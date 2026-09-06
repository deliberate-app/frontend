import { useState } from 'react';
import type { Address } from 'viem';
import type { DebateSchedule } from '../lib/debateTiming';
import { formatVotes } from '../lib/votes';
import { formatTokenAmount, type TokenInfo } from '../lib/tokens';
import type { DebateFilter, DebateSummary, Phase } from '../types';
import { filterDebates } from '../types';
import { AddressChip } from './AddressChip';
import { VerdictMark, verdictLabel } from './VerdictMark';
import type { BountyDraft } from './BountySettings';
import { CreateWizard } from './CreateWizard';

const PHASE_SHORT: Record<Phase, string> = {
  editing: 'Editing',
  rating: 'Rating',
  tallying: 'Tallying',
  finished: 'Finished',
};

/** The dashed opener, and the five-step form it opens. */
function CreatePanel({
  unavailableHint,
  needsWallet,
  onCreate,
  resolveToken,
}: {
  /** Why creating is impossible here at all; null when the deployment supports it. */
  unavailableHint: string | null;
  /** Whether the only thing still missing is a connected wallet. */
  needsWallet: boolean;
  onCreate: (
    thesis: string,
    schedule: DebateSchedule,
    feePercentage: number,
    identityRegistry: Address,
    bounty: BountyDraft | null,
  ) => Promise<void>;
  /** Resolves a custom bounty token address to its identity; absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* A missing wallet is not a reason to refuse the click. Disabling the button would leave the
          visitor with a dead control and a tooltip that a touch device never shows, so instead the
          form opens - they can write the thesis while they decide - and the last step asks for the
          wallet. Only a deployment that cannot create debates at all disables anything. */}
      <button
        type="button"
        className="composer-open create-open"
        onClick={() => setOpen(true)}
        disabled={unavailableHint !== null}
        title={unavailableHint ?? undefined}
      >
        + Start a debate
      </button>
      {open && (
        <CreateWizard
          onClose={() => setOpen(false)}
          onCreate={onCreate}
          needsWallet={needsWallet}
          resolveToken={resolveToken}
        />
      )}
    </>
  );
}

/** The home view: every debate on the contract, filterable, plus the create form. */
export function BrowseView({
  debates,
  account,
  filter,
  onFilter,
  createUnavailableHint,
  needsWallet,
  onOpen,
  onCreate,
  resolveToken,
}: {
  debates: DebateSummary[];
  /** The connected account, enabling the "mine" author-filter shortcut. */
  account?: string;
  /** Filter/sort state is owned by the parent so it survives navigating into a debate and back. */
  filter: DebateFilter;
  onFilter: (filter: DebateFilter) => void;
  /** Why this deployment cannot create debates at all; null when it can. */
  createUnavailableHint: string | null;
  /** Whether creating is possible but no wallet is connected yet. */
  needsWallet: boolean;
  onOpen: (debateId: number) => void;
  onCreate: (
    thesis: string,
    schedule: DebateSchedule,
    feePercentage: number,
    identityRegistry: Address,
    bounty: BountyDraft | null,
  ) => Promise<void>;
  /** Resolves a custom bounty token address to its identity; absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
}) {
  const filtered = filterDebates(debates, filter);

  return (
    <main className="browse">
      <CreatePanel
        unavailableHint={createUnavailableHint}
        needsWallet={needsWallet}
        onCreate={onCreate}
        resolveToken={resolveToken}
      />

      <div className="filters">
        <label className="filter filter-thesis">
          Search
          <input
            type="search"
            value={filter.thesis}
            placeholder="Thesis contains…"
            onChange={(event) => onFilter({ ...filter, thesis: event.target.value })}
          />
        </label>
        <label className="filter">
          Status
          <select
            value={filter.status}
            onChange={(event) => onFilter({ ...filter, status: event.target.value as DebateFilter['status'] })}
          >
            <option value="all">All</option>
            {(Object.keys(PHASE_SHORT) as Phase[]).map((phase) => (
              <option key={phase} value={phase}>
                {PHASE_SHORT[phase]}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          Sort by
          <select
            value={filter.sort}
            onChange={(event) => onFilter({ ...filter, sort: event.target.value as DebateFilter['sort'] })}
          >
            <option value="recent">Newest</option>
            <option value="stake">Most staked</option>
            <option value="bounty">Highest bounty</option>
          </select>
        </label>
        <label className="filter filter-author">
          Creator
          <span className="author-field">
            <input
              type="text"
              value={filter.author}
              placeholder="0x…"
              onChange={(event) => onFilter({ ...filter, author: event.target.value })}
            />
            {/* The mine shortcut lives inside the field it fills. */}
            {account && (
              <button
                type="button"
                className={`author-mine${filter.author === account ? ' author-mine-active' : ''}`}
                title={filter.author === account ? 'Show all creators' : 'Only my debates'}
                onClick={() => onFilter({ ...filter, author: filter.author === account ? '' : account })}
              >
                mine
              </button>
            )}
          </span>
        </label>
      </div>

      {debates.length === 0 ? (
        <p className="column-empty">No debates yet - start the first one.</p>
      ) : filtered.length === 0 ? (
        <p className="column-empty">No debates match the filter.</p>
      ) : (
        <div className="debate-list">
          {filtered.map((debate) => (
            <div className="debate-row" key={debate.id}>
              <button type="button" className="debate-open" onClick={() => onOpen(debate.id)}>
                <span className="debate-thesis">{debate.thesis}</span>
                <span className="debate-meta facts">
                  <span>
                    {debate.argumentsCount} {debate.argumentsCount === 1 ? 'argument' : 'arguments'}
                  </span>
                  <span>
                    <span className="mono">{formatVotes(debate.stake)} ⬡</span> staked
                  </span>
                  {debate.bounty && (
                    <span>
                      <span className="mono">{formatTokenAmount(debate.bounty.pool, debate.bounty)}</span> bounty
                    </span>
                  )}
                </span>
              </button>
              <span className={`phase phase-${debate.phase}`}>{PHASE_SHORT[debate.phase]}</span>
              {/* The verdict slot is always rendered so the phase chips align across rows. */}
              <span
                className={`verdict-mark ${debate.approved === undefined ? '' : debate.approved ? 'verdict-approved' : 'verdict-objected'}`}
                title={debate.approved === undefined ? undefined : verdictLabel(debate.approved)}
              >
                {debate.approved === undefined ? null : <VerdictMark approved={debate.approved} />}
              </span>
              {debate.creator && <AddressChip address={debate.creator} />}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
