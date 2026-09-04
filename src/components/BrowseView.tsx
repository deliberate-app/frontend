import { useState, type FormEvent } from 'react';
import { actionErrorMessage } from '../data/actions';
import { DEFAULT_SCHEDULE, scheduleError, type DebateSchedule } from '../lib/debateTiming';
import { formatVotes } from '../lib/votes';
import { DEFAULT_FEE_PERCENT, feeError } from '../lib/fees';
import { contentError, MAX_CONTENT_BYTES } from '../lib/content';
import { formatDuration } from '../lib/time';
import { formatTokenAmount, type TokenInfo } from '../lib/tokens';
import type { Address } from 'viem';
import type { DebateFilter, DebateSummary, Phase } from '../types';
import { filterDebates } from '../types';
import { AddressChip } from './AddressChip';
import { VerdictMark, verdictLabel } from './VerdictMark';
import { BountySettings, type BountyDraft } from './BountySettings';
import { ContentBudget } from './ContentBudget';
import { FeeSettings } from './FeeSettings';
import { gateAddress, gateLabel, GateSettings, type GateDraft } from './GateSettings';
import type { IdentityRegistryInfo } from '../data/source';
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
  unavailableHint,
  needsWallet,
  onNeedWallet,
  onCreate,
  resolveToken,
  circlesRegistry,
  registries,
  registryFactory,
  canCreateRegistry,
  onCreateAllowlist,
  onCreateCirclesRegistry,
}: {
  /** Why creating is impossible here at all; null when the deployment supports it. */
  unavailableHint: string | null;
  /** Whether the only thing still missing is a connected wallet. */
  needsWallet: boolean;
  /** Opens the wallet picker. */
  onNeedWallet: () => void;
  onCreate: (
    thesis: string,
    schedule: DebateSchedule,
    feePercentage: number,
    identityRegistry: Address,
    bounty: BountyDraft | null,
  ) => Promise<void>;
  /** Resolves a custom bounty token address to its identity; absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
  /** The deployment's Circles preset registry; absent only in sample mode, where creating is disabled. */
  circlesRegistry?: Address;
  /** The registries the creator can pick from: their allowlists and every Circles registry. */
  registries: IdentityRegistryInfo[];
  /** The network's current factory, where it has one. */
  registryFactory?: Address;
  /** Whether a new registry can be cloned here: a wallet is connected and the network has a factory. */
  canCreateRegistry: boolean;
  onCreateAllowlist: () => Promise<Address>;
  onCreateCirclesRegistry: (anchor: Address, requireHuman: boolean) => Promise<Address>;
}) {
  const [open, setOpen] = useState(false);
  const [thesis, setThesis] = useState('');
  const [schedule, setSchedule] = useState<DebateSchedule>(DEFAULT_SCHEDULE);
  const [fee, setFee] = useState(DEFAULT_FEE_PERCENT);
  const [bounty, setBounty] = useState<BountyDraft | null>(null);
  const [gate, setGate] = useState<GateDraft>({ mode: 'open' });
  const [gateOpen, setGateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [bountyOpen, setBountyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    // A missing wallet is not a reason to refuse the click. Disabling the button would leave the
    // visitor with a dead control and a tooltip that a touch device never shows, so instead the
    // form opens - they can write the thesis while they decide - and the wallet picker opens with
    // it. Only a deployment that cannot create debates at all disables anything.
    return (
      <button
        type="button"
        className="composer-open create-open"
        onClick={() => {
          setOpen(true);
          if (needsWallet) onNeedWallet();
        }}
        disabled={unavailableHint !== null}
        title={unavailableHint ?? undefined}
      >
        + Start a debate
      </button>
    );
  }

  const invalidSchedule = scheduleError(schedule);
  const invalidFee = feeError(fee);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate(thesis.trim(), schedule, fee, gateAddress(gate), bounty);
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
        maxLength={MAX_CONTENT_BYTES}
        required
      />
      {/* Schedule and bounty are the two pre-creation settings; they sit side by side. */}
      <div className="composer-config">
        <button
          type="button"
          className="schedule-chip"
          title="The locking window and the lengths of the editing and rating phases."
          onClick={() => setSettingsOpen(true)}
        >
          <span className="facts">
            <span>locking {formatDuration(schedule.lockingDuration)}</span>
            <span>editing {formatDuration(schedule.editingDuration)}</span>
            <span>rating {formatDuration(schedule.ratingDuration)}</span>
          </span>
          <GearIcon />
        </button>
        <button
          type="button"
          className="schedule-chip"
          title="The market fee, paid to the argument's creator on every stake."
          onClick={() => setFeeOpen(true)}
        >
          fee {fee}%
          <GearIcon />
        </button>
        <button
          type="button"
          className="schedule-chip"
          title="Who may join the debate."
          onClick={() => setGateOpen(true)}
        >
          {gateLabel(gate)}
          <GearIcon />
        </button>
        <button
          type="button"
          className="schedule-chip"
          title="An ERC-20 bounty for participants who end with more vote tokens than they were granted."
          onClick={() => setBountyOpen(true)}
        >
          {bounty ? `bounty ${formatTokenAmount(bounty.amount, bounty.token)}` : 'no bounty'}
          <GearIcon />
        </button>
      </div>
      {settingsOpen && (
        <ScheduleSettings
          schedule={schedule}
          onChange={setSchedule}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {feeOpen && <FeeSettings feePercentage={fee} onChange={setFee} onClose={() => setFeeOpen(false)} />}
      {gateOpen && circlesRegistry && (
        <GateSettings
          gate={gate}
          onChange={setGate}
          onClose={() => setGateOpen(false)}
          circlesRegistry={circlesRegistry}
          registries={registries}
          currentFactory={registryFactory}
          canCreate={canCreateRegistry}
          onCreateAllowlist={onCreateAllowlist}
          onCreateCirclesRegistry={onCreateCirclesRegistry}
        />
      )}
      {bountyOpen && (
        <BountySettings
          bounty={bounty}
          onChange={setBounty}
          onClose={() => setBountyOpen(false)}
          resolveToken={resolveToken}
        />
      )}
      <div className="action-row">
        {/* One button in two roles rather than a disabled submit beside a connect prompt: until a
            wallet is connected there is exactly one thing to do here, and it says so. */}
        {needsWallet ? (
          <button type="button" className="btn btn-solid" onClick={onNeedWallet}>
            Connect wallet
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-solid"
            disabled={busy || contentError(thesis.trim()) !== null || invalidSchedule !== null || invalidFee !== null}
            title={
              invalidSchedule ??
              invalidFee ??
              (bounty && bounty.amount > 0n
                ? 'Up to two wallet confirmations: the token approval, then the creation.'
                : undefined)
            }
          >
            {busy ? 'Starting…' : 'Start debate'}
          </button>
        )}
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <ContentBudget text={thesis.trim()} />
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
  createUnavailableHint,
  needsWallet,
  onNeedWallet,
  onOpen,
  onCreate,
  resolveToken,
  circlesRegistry,
  registries,
  registryFactory,
  canCreateRegistry,
  onCreateAllowlist,
  onCreateCirclesRegistry,
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
  /** Opens the wallet picker. */
  onNeedWallet: () => void;
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
  /** The deployment's Circles preset registry; absent only in sample mode, where creating is disabled. */
  circlesRegistry?: Address;
  /** The registries the creator can pick from: their allowlists and every Circles registry. */
  registries: IdentityRegistryInfo[];
  /** The network's current factory, where it has one. */
  registryFactory?: Address;
  /** Whether a new registry can be cloned here: a wallet is connected and the network has a factory. */
  canCreateRegistry: boolean;
  onCreateAllowlist: () => Promise<Address>;
  onCreateCirclesRegistry: (anchor: Address, requireHuman: boolean) => Promise<Address>;
}) {
  const filtered = filterDebates(debates, filter);

  return (
    <main className="browse">
      <CreatePanel
        unavailableHint={createUnavailableHint}
        needsWallet={needsWallet}
        onNeedWallet={onNeedWallet}
        onCreate={onCreate}
        resolveToken={resolveToken}
        circlesRegistry={circlesRegistry}
        registries={registries}
        registryFactory={registryFactory}
        canCreateRegistry={canCreateRegistry}
        onCreateAllowlist={onCreateAllowlist}
        onCreateCirclesRegistry={onCreateCirclesRegistry}
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
                title={
                  debate.approved === undefined ? undefined : verdictLabel(debate.approved)
                }
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
