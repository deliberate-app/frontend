import { useState } from 'react';
import type { ArgumentPosition } from '../data/actions';
import { formatImpact, impactsOf } from '../lib/impact';
import { useNow } from '../lib/time';
import type { Debate, Side } from '../types';
import { ancestryOf, childrenOf, finalizable, thesisOf } from '../types';
import { ArgumentCard } from './ArgumentCard';
import { Composer } from './Composer';
import { FinalizePanel } from './FinalizePanel';
import { StakePanel } from './StakePanel';
import { MiniTree } from './MiniTree';
import { PositionPanel } from './PositionPanel';

/** The debate interactions available to the connected, joined account. */
export interface DebateTx {
  joined: boolean;
  tokens: number;
  addArgument(parentArgumentId: number, side: Side, initialApproval: number, text: string): Promise<void>;
  stake(argumentId: number, side: Side, amount: number): Promise<void>;
  position(argumentId: number): Promise<ArgumentPosition>;
  redeem(argumentId: number): Promise<void>;
  claimFees(argumentId: number): Promise<void>;
  /** Permissionless - available to any connected account, joined or not. */
  finalize(argumentId: number): Promise<void>;
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

  // Live preview of the tally during the rating, the mirrored result afterwards.
  const impacts = debate.phase === 'editing' ? null : impactsOf(debate);
  const focusImpact = impacts?.get(focus.id);
  const totalStake = debate.nodes.reduce((sum, node) => sum + node.weight, 0);

  // Replying requires a final parent, so no composer under a draft focus.
  const authoring = tx !== null && tx.joined && debate.phase === 'editing' && focus.state === 'final';
  const rating = tx !== null && tx.joined && debate.phase === 'rating' && !isThesis && focus.state === 'final';
  const finished = tx !== null && debate.phase === 'finished' && !isThesis;
  const draft = tx !== null && focus.state === 'created' && debate.phase !== 'finished';

  return (
    <main className="debate">
      <MiniTree debate={debate} focusedId={focus.id} onFocus={setFocusedId} />
      <AncestryRail debate={debate} focusedId={focus.id} onFocus={setFocusedId} />

      <section className={`focus ${isThesis ? 'focus-thesis' : `focus-${focus.side}`}`}>
        <p className="focus-kicker">
          {isThesis ? 'Thesis' : focus.side === 'pro' ? 'Pro argument' : 'Con argument'}
        </p>
        <h1 className="focus-text">{focus.text}</h1>
        {isThesis && debate.phase === 'finished' && debate.approved !== undefined && (
          <p className={`verdict ${debate.approved ? 'verdict-approved' : 'verdict-objected'}`}>
            {debate.approved ? 'Thesis confirmed ✓' : 'Thesis objected ✗'}
            {focusImpact !== undefined && (
              <>
                {' '}
                · net impact <strong className="mono">{formatImpact(focusImpact)}</strong>
              </>
            )}
          </p>
        )}
        {isThesis ? (
          <p className="focus-meta">
            Rated through its arguments · total stake <strong className="mono">{totalStake} ⬡</strong>
            {debate.phase !== 'finished' && focusImpact !== undefined && (
              <>
                {' '}
                · net impact{' '}
                <strong className={`mono ${impactClassOf(focusImpact)}`}>{formatImpact(focusImpact)}</strong>
              </>
            )}
          </p>
        ) : (
          <p className="focus-meta">
            Market approval{' '}
            <strong className="mono">{Math.round(focus.approval * 100)}%</strong> · weight{' '}
            <strong className="mono">{focus.weight} ⬡</strong>
            {focusImpact !== undefined && (
              <>
                {' '}
                · impact{' '}
                <strong className={`mono ${impactClassOf(focusImpact)}`}>{formatImpact(focusImpact)}</strong>
              </>
            )}
          </p>
        )}
        {draft && tx && (
          <FinalizePanel
            key={focus.id}
            eligible={finalizable(focus, debate, now)}
            opensIn={
              debate.timing
                ? Math.max(0, focus.finalizationTime - Math.max(now, debate.timing.chainTime))
                : undefined
            }
            onFinalize={() => tx.finalize(focus.id)}
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

      <div className="columns" key={focus.id}>
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
                impact={impacts?.get(node.id)}
                now={now}
                onFocus={setFocusedId}
              />
            ))
          )}
          {authoring && tx && (
            <Composer
              key={`pro-${focus.id}`}
              side="pro"
              tokens={tx.tokens}
              onAdd={(side, approval, text) => tx.addArgument(focus.id, side, approval, text)}
            />
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
                impact={impacts?.get(node.id)}
                now={now}
                onFocus={setFocusedId}
              />
            ))
          )}
          {authoring && tx && (
            <Composer
              key={`con-${focus.id}`}
              side="con"
              tokens={tx.tokens}
              onAdd={(side, approval, text) => tx.addArgument(focus.id, side, approval, text)}
            />
          )}
        </section>
      </div>
    </main>
  );
}
