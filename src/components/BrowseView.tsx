import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';
import { DEFAULT_SCHEDULE, scheduleError, type DebateSchedule } from '../lib/debateTiming';
import { formatDuration } from '../lib/time';
import type { DebateFilter, DebateSummary, Phase } from '../types';
import { filterDebates } from '../types';
import { AddressChip } from './AddressChip';
import { ScheduleSettings } from './ScheduleSettings';

const PHASE_SHORT: Record<Phase, string> = {
  editing: 'Editing',
  rating: 'Rating',
  tallying: 'Tallying',
  finished: 'Finished',
};

/**
 * The form starting a new debate: thesis plus a sensible default schedule, with deviations tucked
 * behind the cogwheel so the happy path stays one field and one button.
 */
function CreatePanel({
  disabledHint,
  onCreate,
}: {
  /** Why creating is unavailable; null when it is possible. */
  disabledHint: string | null;
  onCreate: (thesis: string, schedule: DebateSchedule) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [thesis, setThesis] = useState('');
  const [schedule, setSchedule] = useState<DebateSchedule>(DEFAULT_SCHEDULE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="composer-open"
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
      await onCreate(thesis.trim(), schedule);
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
        maxLength={2000}
        required
      />
      <div className="create-schedule-row">
        <span className="create-schedule">
          drafts lock in {formatDuration(schedule.timeUnit)} · editing{' '}
          {formatDuration(schedule.editingDuration)} · rating {formatDuration(schedule.ratingDuration)}
        </span>
        <button
          type="button"
          className="gear-btn"
          aria-label="Debate schedule settings"
          title="Debate schedule settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙︎
        </button>
      </div>
      {settingsOpen && (
        <ScheduleSettings
          schedule={schedule}
          onChange={setSchedule}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <div className="action-row">
        <button
          type="submit"
          className="btn btn-solid"
          disabled={busy || thesis.trim().length === 0 || invalidSchedule !== null}
          title={invalidSchedule ?? undefined}
        >
          {busy ? 'Creating…' : 'Create debate'}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
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
}: {
  debates: DebateSummary[];
  /** The connected account, enabling the "mine" author-filter shortcut. */
  account?: string;
  /** Filter/sort state is owned by the parent so it survives navigating into a debate and back. */
  filter: DebateFilter;
  onFilter: (filter: DebateFilter) => void;
  createDisabledHint: string | null;
  onOpen: (debateId: number) => void;
  onCreate: (thesis: string, schedule: DebateSchedule) => Promise<void>;
}) {
  const filtered = filterDebates(debates, filter);

  return (
    <main className="browse">
      <CreatePanel disabledHint={createDisabledHint} onCreate={onCreate} />

      <div className="filters">
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
          </select>
        </label>
        <label className="filter filter-author">
          Author
          <input
            type="text"
            value={filter.author}
            placeholder="0x…"
            onChange={(event) => onFilter({ ...filter, author: event.target.value })}
          />
        </label>
        {account && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => onFilter({ ...filter, author: filter.author === account ? '' : account })}
          >
            {filter.author === account ? 'All authors' : 'Mine'}
          </button>
        )}
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
                </span>
              </button>
              <span className={`phase phase-${debate.phase}`}>{PHASE_SHORT[debate.phase]}</span>
              {debate.creator && <AddressChip address={debate.creator} />}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
