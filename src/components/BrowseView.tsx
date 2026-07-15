import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';
import { DEFAULT_SCHEDULE, scheduleError, type DebateSchedule } from '../lib/debateTiming';
import { MAX_CONTENT_CHARS } from '../lib/ipfs';
import { formatDuration } from '../lib/time';
import { formatTokenAmount, type TokenInfo } from '../lib/tokens';
import type { DebateFilter, DebateSummary, Phase } from '../types';
import { filterDebates } from '../types';
import { AddressChip } from './AddressChip';
import { BountySettings, type BountyDraft } from './BountySettings';
import { CharBudget } from './CharBudget';
import { ScheduleSettings } from './ScheduleSettings';

const PHASE_SHORT: Record<Phase, string> = {
  editing: 'Editing',
  rating: 'Rating',
  tallying: 'Tallying',
  finished: 'Finished',
};

/** A small cogwheel in the classic silhouette, inline SVG so it sizes and centers exactly. */
function GearIcon() {
  const toothHalf = (10 * Math.PI) / 180;
  const step = Math.PI / 4;
  const point = (radius: number, angle: number) =>
    `${(8 + radius * Math.cos(angle)).toFixed(2)},${(8 + radius * Math.sin(angle)).toFixed(2)}`;
  const outline = Array.from({ length: 8 }, (_, i) => {
    const center = i * step;
    return [
      point(5.2, center - toothHalf),
      point(7.2, center - toothHalf),
      point(7.2, center + toothHalf),
      point(5.2, center + toothHalf),
    ].join(' L');
  }).join(' L');
  // The hub hole is a second, opposite-wound subpath cut out by the even-odd fill rule.
  const hole = 'M10.2,8 A2.2,2.2 0 1 0 5.8,8 A2.2,2.2 0 1 0 10.2,8 Z';
  return (
    <svg className="gear-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={`M${outline} Z ${hole}`}
        fill="currentColor"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The form starting a new debate: thesis plus a sensible default schedule, with deviations tucked
 * behind the cogwheel so the happy path stays one field and one button.
 */
function CreatePanel({
  disabledHint,
  onCreate,
  resolveToken,
}: {
  /** Why creating is unavailable; null when it is possible. */
  disabledHint: string | null;
  onCreate: (thesis: string, schedule: DebateSchedule, bounty: BountyDraft | null) => Promise<void>;
  /** Resolves a custom bounty token address to its identity; absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
}) {
  const [open, setOpen] = useState(false);
  const [thesis, setThesis] = useState('');
  const [schedule, setSchedule] = useState<DebateSchedule>(DEFAULT_SCHEDULE);
  const [bounty, setBounty] = useState<BountyDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bountyOpen, setBountyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="composer-open create-open"
        onClick={() => setOpen(true)}
        disabled={disabledHint !== null}
        title={disabledHint ?? undefined}
      >
        + Start a debate
      </button>
    );
  }

  const invalidSchedule = scheduleError(schedule);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate(thesis.trim(), schedule, bounty);
      // Success navigates away to the new debate; no local state to reset.
    } catch (cause) {
      setError(actionErrorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        className="composer-text"
        value={thesis}
        onChange={(event) => setThesis(event.target.value)}
        placeholder="The thesis to debate…"
        rows={3}
        maxLength={MAX_CONTENT_CHARS}
        required
      />
      <button
        type="button"
        className="schedule-chip"
        title="Customize the debate schedule"
        onClick={() => setSettingsOpen(true)}
      >
        locking {formatDuration(schedule.lockingDuration)} · editing {formatDuration(schedule.editingDuration)}{' '}
        · rating {formatDuration(schedule.ratingDuration)}
        <GearIcon />
      </button>
      {settingsOpen && (
        <ScheduleSettings
          schedule={schedule}
          onChange={setSchedule}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <button
        type="button"
        className="schedule-chip"
        title="Attach an ERC-20 prize for the debate's net winners"
        onClick={() => setBountyOpen(true)}
      >
        {bounty ? `bounty ${formatTokenAmount(bounty.amount, bounty.token)}` : 'no bounty'}
        <GearIcon />
      </button>
      {bountyOpen && (
        <BountySettings
          bounty={bounty}
          onChange={setBounty}
          onClose={() => setBountyOpen(false)}
          resolveToken={resolveToken}
        />
      )}
      <div className="action-row">
        <button
          type="submit"
          className="btn btn-solid"
          disabled={busy || thesis.trim().length === 0 || invalidSchedule !== null}
          title={
            invalidSchedule ??
            (bounty && bounty.amount > 0n
              ? 'Funding the bounty may ask for two confirmations: the token approval, then the creation.'
              : undefined)
          }
        >
          {busy ? 'Creating…' : 'Create debate'}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <CharBudget length={thesis.length} />
      </div>
      {error && <p className="action-error">{error}</p>}
    </form>
  );
}

/** The home view: every debate on the contract, filterable, plus the create form. */
export function BrowseView({
  debates,
  account,
  filter,
  onFilter,
  createDisabledHint,
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
  createDisabledHint: string | null;
  onOpen: (debateId: number) => void;
  onCreate: (thesis: string, schedule: DebateSchedule, bounty: BountyDraft | null) => Promise<void>;
  /** Resolves a custom bounty token address to its identity; absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
}) {
  const filtered = filterDebates(debates, filter);

  return (
    <main className="browse">
      <CreatePanel disabledHint={createDisabledHint} onCreate={onCreate} resolveToken={resolveToken} />

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
          Author
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
                title={filter.author === account ? 'Show all authors' : 'Only my debates'}
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
                <span className="debate-meta">
                  {debate.argumentsCount} {debate.argumentsCount === 1 ? 'argument' : 'arguments'} ·{' '}
                  <span className="mono">{debate.stake} ⬡</span> staked
                  {debate.bounty && (
                    <>
                      {' '}
                      · <span className="mono">{formatTokenAmount(debate.bounty.pool, debate.bounty)}</span> bounty
                    </>
                  )}
                </span>
              </button>
              <span className={`phase phase-${debate.phase}`}>{PHASE_SHORT[debate.phase]}</span>
              {/* The verdict slot is always rendered so the phase chips align across rows. */}
              <span
                className={`verdict-mark ${debate.approved === undefined ? '' : debate.approved ? 'verdict-approved' : 'verdict-objected'}`}
                title={
                  debate.approved === undefined ? undefined : debate.approved ? 'Thesis confirmed' : 'Thesis objected'
                }
              >
                {debate.approved === undefined ? '' : debate.approved ? '✓' : '✗'}
              </span>
              {debate.creator && <AddressChip address={debate.creator} />}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
