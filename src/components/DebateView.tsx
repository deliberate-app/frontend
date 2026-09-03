import { zeroAddress } from 'viem';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ArgumentPosition } from '../data/actions';
import { tallyOf } from '../lib/impact';
import { shortAddress } from '../lib/address';
import { useNow } from '../lib/time';
import type { AccountPosition, ArgumentNode, Debate, Side } from '../types';
import type { StakeEvent } from '../lib/history';
import { ancestryOf, childrenOf, editingOpen, liveChainTime, livePhaseOf, thesisOf } from '../types';
import { AddressChip } from './AddressChip';
import { VerdictMark } from './VerdictMark';
import { BountyPanel, BountyTopUpChip } from './BountyPanel';
import { ArgumentCard } from './ArgumentCard';
import { ArgumentFigures, figuresLabel, RatingGauge, TotalStake } from './Figures';
import { Composer } from './Composer';
import { DraftControls, type MoveTarget } from './DraftControls';
import { LockChip } from './LockChip';
import { ArgumentDetail } from './ArgumentDetail';
import { StakeModal } from './StakeModal';
import { MiniTree } from './MiniTree';
import { PositionPanel } from './PositionPanel';

/** The debate interactions available to the connected, joined account. */
export interface DebateTx {
  /** The connected account, for owner-only affordances (editing/moving a draft). */
  account: string;
  joined: boolean;
  tokens: number;
  createArgument(
    parentArgumentId: number,
    side: Side,
    initialApproval: number,
    deposit: number,
    text: string,
  ): Promise<void>;
  /** Edit a still-draft argument's text (creator only). */
  alterArgument(argumentId: number, text: string): Promise<void>;
  /** Move a still-draft argument beneath a finalized parent, re-seeding its rating (creator only). */
  moveArgument(argumentId: number, newParentArgumentId: number, initialApproval: number): Promise<void>;
  stake(argumentId: number, side: Side, amount: number): Promise<void>;
  position(argumentId: number): Promise<ArgumentPosition>;
  /** The account's share holdings across the debate (from the indexer, chain fallback). */
  loadPositions(): Promise<AccountPosition[]>;
  redeem(argumentId: number): Promise<void>;
  /** Redeems the account's shares across several arguments in one transaction. */
  redeemBatch(argumentIds: number[]): Promise<void>;
  claimFees(argumentId: number): Promise<void>;
  /** Whether the account has claimed its bounty share (claims are one-shot). */
  bountyClaimed: boolean;
  /** Tops up the debate's bounty pool (any account, until the debate finishes). */
  fundBounty(amount: bigint): Promise<void>;
  /** Settles the given argument positions and claims the account's bounty share in one transaction. */
  claimBounty(argumentIds: number[]): Promise<void>;
  /** Sweeps the unclaimed bounty remainder to the creator once the claim window is over. */
  sweepBounty(): Promise<void>;
}

/** A short label identifying an argument as a move target. */
function moveTargetLabel(node: { parentId: number | null; side: Side | null; text: string }): string {
  const kind = node.parentId === null ? 'Thesis' : node.side === 'pro' ? 'Pro' : 'Con';
  const text = node.text.length > 60 ? `${node.text.slice(0, 57)}…` : node.text;
  return `${kind}: ${text}`;
}

/** The disclosure chevron of the path: pointing down to open the claims, up to fold them away. */
function Chevron({ up }: { up: boolean }) {
  return (
    <svg className="rail-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d={up ? 'M4 10 8 6l4 4' : 'M4 6l4 4 4-4'} />
    </svg>
  );
}

/**
 * The ancestry rail: the path from the thesis down to the focused claim,
 * drawn as a branch whose connectors carry the polarity of each step.
 * Collapsed, each step is one clipped line; expanded, every parent claim up to the thesis
 * is readable in full. Claims only: the path is for finding the way back, and each step's
 * figures are one click away on the step itself.
 */
function AncestryRail({
  debate,
  focusedId,
  expanded,
  onExpandedChange,
  onFocus,
}: {
  debate: Debate;
  focusedId: number;
  /** Whether the parent claims read in full (the reader's choice, kept across focus changes). */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onFocus: (id: number) => void;
}) {
  const path = ancestryOf(debate, focusedId);
  if (path.length <= 1) return null;

  const ancestors = path.slice(0, -1);
  const focus = path[path.length - 1];

  return (
    <nav className={`rail ${expanded ? 'rail-expanded' : ''}`} aria-label="Path from thesis">
      {ancestors.map((node, depth) => (
        <div className="rail-step" key={node.id} style={{ marginLeft: `${depth * 1.25}rem` }}>
          {depth > 0 && (
            <span className={`rail-connector rail-${node.side}`} aria-hidden>
              └─
            </span>
          )}
          <button type="button" className="rail-node" onClick={() => onFocus(node.id)}>
            <span className="rail-claim">{node.text}</span>
          </button>
        </div>
      ))}
      <div className="rail-step" style={{ marginLeft: `${ancestors.length * 1.25}rem` }}>
        <span className={`rail-connector rail-${focus.side}`} aria-hidden>
          └─
        </span>
        <button
          type="button"
          className="rail-toggle"
          aria-expanded={expanded}
          title={
            expanded
              ? 'Fold the path back to one line per claim'
              : 'Read every claim on the path up to the thesis in full'
          }
          onClick={() => onExpandedChange(!expanded)}
        >
          <Chevron up={expanded} />
          {expanded ? 'Collapse path' : 'Expand path'}
        </button>
      </div>
    </nav>
  );
}

/** How often the markets are refetched while the stake modal is open: one light query per tick. */
const MARKET_POLL_MS = 5_000;

export function DebateView({
  debate,
  tx,
  feesEarnedOf,
  historyOfDebate,
  onRefreshMarkets,
}: {
  debate: Debate;
  tx: DebateTx | null;
  /** The market fees an argument has earned its author so far; absent for sample data. */
  feesEarnedOf?: (debateId: number, argumentId: number) => Promise<number>;
  /** Reads every stake the debate has seen, for the argument detail's chart. */
  historyOfDebate?: (debateId: number) => Promise<StakeEvent[]>;
  /** Refetches only the markets into `debate`; polled while the stake modal is open. Absent for sample data. */
  onRefreshMarkets?: () => Promise<void>;
}) {
  const thesis = thesisOf(debate);
  const [focusedId, setFocusedId] = useState(thesis.id);
  // The focused argument's market detail (the curve modal), opened from the rating market link.
  const [detailOpen, setDetailOpen] = useState(false);
  // The stake history, fetched once the detail view is opened - it is only ever read there, and it
  // is the one query in this view whose size grows with the whole debate rather than one argument.
  const [stakes, setStakes] = useState<readonly StakeEvent[]>([]);
  useEffect(() => {
    if (!detailOpen || !historyOfDebate) return;
    let cancelled = false;
    historyOfDebate(debate.id)
      .then((history) => {
        if (!cancelled) setStakes(history);
      })
      .catch(() => {
        // A chart is not worth an error state: without history the detail simply has no chart.
        if (!cancelled) setStakes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detailOpen, historyOfDebate, debate.id]);
  // The stake modal, opened from the focus meta during the rating phase.
  const [stakeOpen, setStakeOpen] = useState(false);
  // While it is open, the markets behind its preview are refetched every few seconds, so a stake
  // is decided against the market as it is - not as it was when the modal opened.
  useEffect(() => {
    if (!stakeOpen || !onRefreshMarkets) return;
    void onRefreshMarkets();
    const timer = setInterval(() => void onRefreshMarkets(), MARKET_POLL_MS);
    return () => clearInterval(timer);
  }, [stakeOpen, onRefreshMarkets]);
  // Whether the ancestry rail reads its parent claims in full. Held here, not in the rail, so the
  // choice survives navigating the tree (the rail unmounts whenever the thesis is focused).
  const [pathExpanded, setPathExpanded] = useState(false);
  const now = useNow();

  const byId = new Map(debate.nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusedId) ?? thesis;
  // Stable per focused argument, so the market detail loads the figure once, not on every tick.
  const loadFeesEarned = useMemo(
    () => (feesEarnedOf ? () => feesEarnedOf(debate.id, focus.id) : undefined),
    [feesEarnedOf, debate.id, focus.id],
  );
  const pros = childrenOf(debate, focus.id, 'pro');
  const cons = childrenOf(debate, focus.id, 'con');
  const isThesis = focus.id === thesis.id;

  // A live, client-side preview of the tally in every phase - during editing arguments start
  // counting as they lock in (drafts contribute nothing, like the tally treats them) - and the
  // mirrored result once run.
  // Memoized on the debate, not left to every render: the clock ticks once a second and the tally
  // walks the tree per node, so recomputing it with the countdown would spend milliseconds a second
  // on an answer that only changes when the debate is refetched.
  const { tallies, totalStake } = useMemo(
    () => ({
      tallies: tallyOf(debate),
      totalStake: debate.nodes.reduce((sum, node) => sum + node.weight, 0),
    }),
    [debate],
  );
  const focusTally = tallies.get(focus.id);
  // What the rings are a share of. The thesis' subtree stake, not the sum of every node's, because
  // that is the same accounting the arcs themselves come from: the tally leaves drafts out, so a
  // denominator that counted them would give arcs that cannot add up to their own circle. Zero
  // while nothing has locked in yet, which is when a share of the tally means nothing anyway.
  const talliedStake = tallies.get(thesis.id)?.subtreeWeight ?? 0;

  // An argument is locked once the data says final or the live clock has passed its finalization
  // time - the same rule the cards' padlocks follow.
  const lockedNow = (node: ArgumentNode) =>
    node.state === 'final' ||
    (debate.timing !== undefined && node.finalizationTime <= liveChainTime(debate.timing, now));

  // The focused argument's lock state, mirroring the cards: a live countdown while a draft,
  // locked once the clock passes its finalization time (or the data already says final).
  const focusFinalizesIn =
    focus.state === 'created' && debate.timing ? focus.finalizationTime - liveChainTime(debate.timing, now) : null;
  const focusLocked = lockedNow(focus);

  // Phase gates follow the live clock (see livePhaseOf), so the rating affordances open the moment
  // the editing window passes - the poll only catches up on data, never on time. Replying and
  // staking both additionally need a locked-in argument, which finalizes by the same clock.
  const phase = livePhaseOf(debate, now);
  const canAuthor = editingOpen(debate, now);
  const authoring = tx !== null && tx.joined && canAuthor && focusLocked;
  const rating = tx !== null && tx.joined && phase === 'rating' && !isThesis && focusLocked;
  const finished = tx !== null && phase === 'finished' && !isThesis;
  const draft = tx !== null && !focusLocked && phase !== 'finished';
  // Editing/moving a draft is creator-only (the contract enforces it too).
  const ownDraft =
    draft &&
    tx !== null &&
    phase === 'editing' &&
    focus.creator !== undefined &&
    focus.creator.toLowerCase() === tx.account.toLowerCase();
  // A draft can move beneath any finalized argument except its current parent.
  const moveTargets: MoveTarget[] = ownDraft
    ? debate.nodes
        .filter((node) => lockedNow(node) && node.id !== focus.parentId)
        .map((node) => ({ id: node.id, label: moveTargetLabel(node) }))
    : [];

  return (
    <main className="debate">
      <MiniTree debate={debate} focusedId={focus.id} onFocus={setFocusedId} />
      <AncestryRail
        debate={debate}
        focusedId={focus.id}
        expanded={pathExpanded}
        onExpandedChange={setPathExpanded}
        onFocus={setFocusedId}
      />

      {isThesis && <BountyPanel debate={debate} tx={tx} now={now} />}

      <section className={`focus ${isThesis ? 'focus-thesis' : `focus-${focus.side}`}`}>
        <div className="focus-kicker-row">
          <p className="focus-kicker">
            {isThesis ? 'Thesis' : focus.side === 'pro' ? 'Pro argument' : 'Con argument'}
          </p>
          {focus.creator && <AddressChip address={focus.creator} />}
        </div>
        <h1 className="focus-text">{focus.text}</h1>
        {isThesis && phase === 'finished' && debate.approved !== undefined && (
          <p className={`verdict ${debate.approved ? 'verdict-approved' : 'verdict-objected'}`}>
            {debate.approved ? 'Thesis confirmed ' : 'Thesis objected '}
            <VerdictMark approved={debate.approved} />
          </p>
        )}
        {isThesis ? (
          <p className="focus-meta">
            {/* The thesis owns no market, so its gauge is its rating alone - and a ring would be a
                share of itself, so the debate's stake reads as the engagement figure it is. */}
            {focusTally && (
              <>
                <RatingGauge rating={focusTally.rating} /> ·{' '}
              </>
            )}
            <TotalStake total={totalStake} />
            {debate.bounty && (
              <>
                {' '}
                · <BountyTopUpChip debate={debate} tx={tx} />
              </>
            )}
            {debate.identityRegistry !== undefined && (
              <>
                {' '}
                ·{' '}
                {debate.identityRegistry === zeroAddress ? (
                  <span title="Anyone may join this debate.">open to everyone</span>
                ) : (
                  <span title={`Joining is gated by the identity registry at ${debate.identityRegistry}.`}>
                    members of <span className="mono">{shortAddress(debate.identityRegistry)}</span>
                  </span>
                )}
              </>
            )}
          </p>
        ) : (
          <p className="focus-meta">
            {/* The figures are the way into the market that produced them, so there is nothing to
                label with an "i": the thing you want to know more about is the thing you click. The
                label carries the figures as well as the action, because the drawings inside are
                marked presentational - a name that said only "about this market" would make the
                two figures unreachable without a mouse. */}
            <button
              type="button"
              className="figure-button"
              title="Argument details"
              aria-label={`${figuresLabel(focus, focusTally, talliedStake)}. Argument details`}
              onClick={() => setDetailOpen(true)}
            >
              <ArgumentFigures node={focus} tally={focusTally} total={talliedStake} presentational />
            </button>{' '}
            · <LockChip locked={focusLocked} finalizesIn={focusFinalizesIn} />
          </p>
        )}
        {rating && tx && (
          <div className="action-panel">
            <div className="action-row">
              <button
                type="button"
                className="btn"
                title="Stake vote tokens on this argument being under- or overrated."
                onClick={() => setStakeOpen(true)}
              >
                Stake ⬡
              </button>
              <span className="action-hint">
                You profit if the rating corrects your way once the debate ends
                {debate.feePercentage > 0 ? ` · ${debate.feePercentage}% fee to the argument's creator` : ' · no market fee'}
              </span>
            </div>
          </div>
        )}
        {detailOpen && !isThesis && (
          <ArgumentDetail
            debate={debate}
            node={focus}
            tally={focusTally}
            stakes={stakes}
            feePercentage={debate.feePercentage}
            loadFeesEarned={loadFeesEarned}
            onClose={() => setDetailOpen(false)}
          />
        )}
        {ownDraft && tx && (
          <DraftControls
            key={focus.id}
            text={focus.text}
            currentApproval={Math.round(focus.approval * 100)}
            moveTargets={moveTargets}
            onEdit={(text) => tx.alterArgument(focus.id, text)}
            onMove={(newParentArgumentId, initialApproval) =>
              tx.moveArgument(focus.id, newParentArgumentId, initialApproval)
            }
          />
        )}
        {stakeOpen && rating && tx && (
          <StakeModal
            key={focus.id}
            debate={debate}
            node={focus}
            tokens={tx.tokens}
            onStake={(side, amount) => tx.stake(focus.id, side, amount)}
            onClose={() => setStakeOpen(false)}
          />
        )}
        {finished && tx && (
          <PositionPanel
            key={focus.id}
            argumentId={focus.id}
            load={tx.position}
            onRedeem={tx.redeem}
            onClaimFees={tx.claimFees}
          />
        )}
      </section>

      <div
        className="columns"
        key={focus.id}
        // Both columns span the same subgrid rows, so the i-th pro and con cards share a row
        // (and a height), and the composers meet on the last one.
        style={
          {
            '--column-rows': 1 + Math.max(pros.length || 1, cons.length || 1) + (authoring && tx ? 1 : 0),
          } as CSSProperties
        }
      >
        <section className="column column-pro" aria-label="Pro arguments">
          <h2 className="column-title">Pros</h2>
          {pros.length === 0 ? (
            <p className="column-empty">
              No pros yet. Arguments can be added during the Editing phase.
            </p>
          ) : (
            pros.map((node) => (
              <ArgumentCard
                key={node.id}
                debate={debate}
                node={node}
                tally={tallies.get(node.id)}
                now={now}
                totalStake={talliedStake}
                onFocus={setFocusedId}
              />
            ))
          )}
          {authoring && tx && (
            <div className="column-composer">
              <Composer
                key={`pro-${focus.id}`}
                side="pro"
                tokens={tx.tokens}
                onAdd={(side, approval, deposit, text) =>
                  tx.createArgument(focus.id, side, approval, deposit, text)
                }
              />
            </div>
          )}
        </section>

        <section className="column column-con" aria-label="Con arguments">
          <h2 className="column-title">Cons</h2>
          {cons.length === 0 ? (
            <p className="column-empty">
              No cons yet. Arguments can be added during the Editing phase.
            </p>
          ) : (
            cons.map((node) => (
              <ArgumentCard
                key={node.id}
                debate={debate}
                node={node}
                tally={tallies.get(node.id)}
                now={now}
                totalStake={talliedStake}
                onFocus={setFocusedId}
              />
            ))
          )}
          {authoring && tx && (
            <div className="column-composer">
              <Composer
                key={`con-${focus.id}`}
                side="con"
                tokens={tx.tokens}
                onAdd={(side, approval, deposit, text) =>
                  tx.createArgument(focus.id, side, approval, deposit, text)
                }
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
