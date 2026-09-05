import { useState } from 'react';
import type { Address } from 'viem';
import { actionErrorMessage } from '../data/actions';
import { contentError, MAX_CONTENT_BYTES } from '../lib/content';
import { DEFAULT_SCHEDULE, scheduleError, type DebateSchedule } from '../lib/debateTiming';
import { DEFAULT_FEE_PERCENT, feeError } from '../lib/fees';
import { formatDuration } from '../lib/time';
import { formatTokenAmount, type TokenInfo } from '../lib/tokens';
import { BountyFields, type BountyDraft } from './BountySettings';
import { Steps } from './Choice';
import { ContentBudget } from './ContentBudget';
import { FeeFields } from './FeeSettings';
import { gateAddress, gateLabel, ParticipantFields, type GateDraft } from './GateSettings';
import { Modal } from './Modal';
import { ScheduleFields } from './ScheduleSettings';

const STEPS = ['Thesis', 'Schedule', 'Participants', 'Fee', 'Bounty', 'Summary'] as const;

/** What still stands between the summary and a signature, wherever in the form it was left. */
const unfinishedOf = (...problems: (string | null)[]) => problems.find((problem) => problem !== null) ?? null;

/**
 * Starting a debate, in five steps.
 *
 * Every setting used to be a chip of its own kind opening a modal of its own kind, so the five
 * decisions behind a debate looked like five unrelated features. They are one form now, taken in
 * order, and every step but the thesis arrives already answered - the reader can read the defaults
 * and click through, or stop at the one they care about.
 *
 * The steps stay reachable in any order, since none of them can be left unanswered. Only the last
 * one signs anything.
 */
export function CreateWizard({
  onClose,
  onCreate,
  needsWallet,
  onNeedWallet,
  resolveToken,
  circlesRegistry,
}: {
  onClose: () => void;
  onCreate: (
    thesis: string,
    schedule: DebateSchedule,
    feePercentage: number,
    identityRegistry: Address,
    bounty: BountyDraft | null,
  ) => Promise<void>;
  /** Whether the only thing still missing is a connected wallet. */
  needsWallet: boolean;
  onNeedWallet: () => void;
  /** Resolves a custom bounty token address to its identity; absent in sample mode. */
  resolveToken?: (address: string) => Promise<TokenInfo>;
  /** The deployment's Circles preset registry; absent only in sample mode, where creating is off. */
  circlesRegistry?: Address;
}) {
  const [step, setStep] = useState(0);
  const [thesis, setThesis] = useState('');
  const [schedule, setSchedule] = useState<DebateSchedule>(DEFAULT_SCHEDULE);
  const [gate, setGate] = useState<GateDraft>({ mode: 'open' });
  const [fee, setFee] = useState(DEFAULT_FEE_PERCENT);
  const [bounty, setBounty] = useState<BountyDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badThesis = contentError(thesis.trim());
  const badSchedule = scheduleError(schedule);
  const badFee = feeError(fee);
  // What keeps this step from being left, and on the last step from being signed.
  const blocking =
    [badThesis, badSchedule, null, badFee, null, unfinishedOf(badThesis, badSchedule, badFee)][step] ?? null;
  // An untouched thesis is not a mistake yet, so the disabled Next says it rather than a red line.
  const shown = step === 0 && thesis === '' ? null : blocking;
  const last = step === STEPS.length - 1;

  const create = async () => {
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
    <Modal title="Start a debate" onClose={onClose} wide>
      <Steps steps={STEPS} active={step} onSelect={setStep} />

      <div className="tab-panel" hidden={step !== 0}>
        <label className="duration-field">
          <span className="duration-label">Thesis</span>
          <textarea
            className="composer-text"
            value={thesis}
            onChange={(event) => setThesis(event.target.value)}
            placeholder="The thesis to debate…"
            rows={3}
            maxLength={MAX_CONTENT_BYTES}
          />
          <span className="duration-hint">The claim everything else argues for or against.</span>
        </label>
        <ContentBudget text={thesis.trim()} />
      </div>

      <div className="tab-panel" hidden={step !== 1}>
        <ScheduleFields schedule={schedule} onChange={setSchedule} />
      </div>

      <div className="tab-panel" hidden={step !== 2}>
        {circlesRegistry ? (
          <ParticipantFields gate={gate} onChange={setGate} circlesRegistry={circlesRegistry} />
        ) : (
          <p className="composer-hint">Anyone may join.</p>
        )}
      </div>

      <div className="tab-panel" hidden={step !== 3}>
        <FeeFields feePercentage={fee} onChange={setFee} />
      </div>

      <div className="tab-panel" hidden={step !== 4}>
        <BountyFields bounty={bounty} onChange={setBounty} resolveToken={resolveToken} />
      </div>

      <div className="tab-panel" hidden={step !== 5}>
        <dl className="summary-list">
          <div className="summary-row">
            <dt>Thesis</dt>
            <dd>{thesis.trim() === '' ? 'Not written yet' : thesis.trim()}</dd>
          </div>
          <div className="summary-row">
            <dt>Schedule</dt>
            <dd className="facts">
              <span>locking {formatDuration(schedule.lockingDuration)}</span>
              <span>editing {formatDuration(schedule.editingDuration)}</span>
              <span>rating {formatDuration(schedule.ratingDuration)}</span>
            </dd>
          </div>
          <div className="summary-row">
            <dt>Participants</dt>
            <dd>{gateLabel(gate)}</dd>
          </div>
          <div className="summary-row">
            <dt>Fee</dt>
            <dd>{fee}%</dd>
          </div>
          <div className="summary-row">
            <dt>Bounty</dt>
            <dd>{bounty ? formatTokenAmount(bounty.amount, bounty.token) : 'None'}</dd>
          </div>
        </dl>
      </div>

      <div className="action-row">
        <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={step === 0 || busy}>
          Back
        </button>
        {last ? (
          needsWallet ? (
            <button type="button" className="btn btn-solid" onClick={onNeedWallet}>
              Connect wallet
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy || blocking !== null}
              title={blocking ?? undefined}
              onClick={() => void create()}
            >
              {busy ? 'Starting…' : 'Start debate'}
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn btn-solid"
            disabled={blocking !== null}
            title={blocking ?? undefined}
            onClick={() => setStep(step + 1)}
          >
            Next
          </button>
        )}
      </div>
      {shown && <p className="action-error">{shown}</p>}
      {error && <p className="action-error">{error}</p>}
    </Modal>
  );
}
