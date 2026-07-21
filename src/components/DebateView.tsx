import { useState, type CSSProperties } from 'react';
import type { ArgumentPosition } from '../data/actions';
import { formatApproval, formatImpact, IMPACT_HINT, impactsOf, NET_IMPACT_HINT } from '../lib/impact';
import { useNow } from '../lib/time';
import type { AccountPosition, ArgumentNode, Debate, Side } from '../types';
import { ancestryOf, childrenOf, editingOpen, liveChainTime, livePhaseOf, thesisOf } from '../types';
import { AddressChip } from './AddressChip';
import { VerdictMark } from './VerdictMark';
import { BountyPanel, BountyTopUpChip } from './BountyPanel';
import { ContentText } from './ContentText';
import { ArgumentCard } from './ArgumentCard';
import { Composer } from './Composer';
import { DraftControls, type MoveTarget } from './DraftControls';
import { LockChip } from './LockChip';
import { StakePanel } from './StakePanel';
import { MiniTree } from './MiniTree';
import { PositionPanel } from './PositionPanel';
import { RedeemAllPanel } from './RedeemAllPanel';

/** The debate interactions available to the connected, joined account. */
export interface DebateTx {
  /** The connected account, for owner-only affordances (editing/moving a draft). */
  account: string;
  joined: boolean;
  tokens: number;
  addArgument(
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

/**
 * The ancestry rail: the path from the thesis down to the focused claim,
 * drawn as a branch whose connectors carry the polarity of each step.
 */
function AncestryRail({
  debate,
  focusedId,
  onFocus,
}: {
  debate: Debate;
  focusedId: number;
  onFocus: (id: number) => void;
}) {
  const path = ancestryOf(debate, focusedId);
  if (path.length <= 1) return null;

  const ancestors = path.slice(0, -1);
  const focus = path[path.length - 1];

  return (
    <nav className="rail" aria-label="Path from thesis">
      {ancestors.map((node, depth) => (
        <div className="rail-step" key={node.id} style={{ marginLeft: `${depth * 1.25}rem` }}>
          {depth > 0 && (
            <span className={`rail-connector rail-${node.side}`} aria-hidden>
              └─
            </span>
          )}
          <button type="button" className="rail-node" onClick={() => onFocus(node.id)}>
            {node.text}
          </button>
        </div>
      ))}
      <div
        className="rail-step"
        style={{ marginLeft: `${ancestors.length * 1.25}rem` }}
        aria-hidden
      >
        <span className={`rail-connector rail-${focus.side}`}>└─</span>
      </div>
    </nav>
  );
}

const impactClassOf = (impact: number) => (impact > 0 ? 'impact-pos' : impact < 0 ? 'impact-neg' : '');

export function DebateView({ debate, tx }: { debate: Debate; tx: DebateTx | null }) {
  const thesis = thesisOf(debate);
  const [focusedId, setFocusedId] = useState(thesis.id);
  const now = useNow();

  const byId = new Map(debate.nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusedId) ?? thesis;
  const pros = childrenOf(debate, focus.id, 'pro');
  const cons = childrenOf(debate, focus.id, 'con');
  const isThesis = focus.id === thesis.id;

  // A live, client-side preview of the tally in every phase - during editing arguments sway as they
  // lock in (drafts contribute nothing, like the tally treats them) - and the mirrored result once run.
  const impacts = impactsOf(debate);
  const focusImpact = impacts.get(focus.id);
  const totalStake = debate.nodes.reduce((sum, node) => sum + node.weight, 0);

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
      <AncestryRail debate={debate} focusedId={focus.id} onFocus={setFocusedId} />

      {tx && tx.joined && phase === 'finished' && (
        <RedeemAllPanel loadPositions={tx.loadPositions} onRedeemAll={tx.redeemBatch} />
      )}
      {isThesis && <BountyPanel debate={debate} tx={tx} now={now} />}

      <section className={`focus ${isThesis ? 'focus-thesis' : `focus-${focus.side}`}`}>
        <div className="focus-kicker-row">
          <p className="focus-kicker">
            {isThesis ? 'Thesis' : focus.side === 'pro' ? 'Pro argument' : 'Con argument'}
          </p>
          {focus.creator && <AddressChip address={focus.creator} />}
        </div>
        <h1 className="focus-text">
          <ContentText text={focus.text} digest={focus.contentDigest} />
        </h1>
        {isThesis && phase === 'finished' && debate.approved !== undefined && (
          <p className={`verdict ${debate.approved ? 'verdict-approved' : 'verdict-objected'}`}>
            {debate.approved ? 'Thesis confirmed ' : 'Thesis objected '}
            <VerdictMark approved={debate.approved} />
            {focusImpact !== undefined && (
              <span title={NET_IMPACT_HINT}>
                {' '}
                · net sway <strong className="mono">{formatImpact(focusImpact)}</strong>
              </span>
            )}
          </p>
        )}
        {isThesis ? (
          <p className="focus-meta">
            Rated through its arguments · total stake <strong className="mono">{totalStake} ⬡</strong>
            {phase !== 'finished' && focusImpact !== undefined && (
              <span title={NET_IMPACT_HINT}>
                {' '}
                · net sway{' '}
                <strong className={`mono ${impactClassOf(focusImpact)}`}>{formatImpact(focusImpact)}</strong>
              </span>
            )}
            {debate.bounty && (
              <>
                {' '}
                · <BountyTopUpChip debate={debate} tx={tx} />
              </>
            )}
          </p>
        ) : (
          <p className="focus-meta">
            Market approval{' '}
            <strong className={`mono ${impactClassOf(2 * focus.approval - 1)}`}>
              {formatApproval(focus.approval)}
            </strong>{' '}
            · weight <strong className="mono">{focus.weight} ⬡</strong>
            {focusImpact !== undefined && (
              <span title={IMPACT_HINT}>
                {' '}
                · sways parent{' '}
                <strong className={`mono ${impactClassOf(focusImpact)}`}>{formatImpact(focusImpact)}</strong>
              </span>
            )}{' '}
            · <LockChip locked={focusLocked} finalizesIn={focusFinalizesIn} />
          </p>
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
        {rating && tx && (
          <StakePanel tokens={tx.tokens} onStake={(side, amount) => tx.stake(focus.id, side, amount)} />
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
                impact={impacts.get(node.id)}
                now={now}
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
                  tx.addArgument(focus.id, side, approval, deposit, text)
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
                impact={impacts.get(node.id)}
                now={now}
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
                  tx.addArgument(focus.id, side, approval, deposit, text)
                }
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
