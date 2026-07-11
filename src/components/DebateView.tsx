import { useState } from 'react';
import type { ArgumentPosition } from '../data/actions';
import type { Debate, Side } from '../types';
import { ancestryOf, childrenOf, thesisOf } from '../types';
import { ArgumentCard } from './ArgumentCard';
import { Composer } from './Composer';
import { InvestPanel } from './InvestPanel';
import { PositionPanel } from './PositionPanel';

/** The debate interactions available to the connected, joined account. */
export interface DebateTx {
  joined: boolean;
  tokens: number;
  addArgument(parentArgumentId: number, side: Side, initialApproval: number, text: string): Promise<void>;
  invest(argumentId: number, side: Side, amount: number): Promise<void>;
  position(argumentId: number): Promise<ArgumentPosition>;
  redeem(argumentId: number): Promise<void>;
  claimFees(argumentId: number): Promise<void>;
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

export function DebateView({ debate, tx }: { debate: Debate; tx: DebateTx | null }) {
  const thesis = thesisOf(debate);
  const [focusedId, setFocusedId] = useState(thesis.id);

  const byId = new Map(debate.nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusedId) ?? thesis;
  const pros = childrenOf(debate, focus.id, 'pro');
  const cons = childrenOf(debate, focus.id, 'con');
  const isThesis = focus.id === thesis.id;

  const authoring = tx !== null && tx.joined && debate.phase === 'editing';
  const rating = tx !== null && tx.joined && debate.phase === 'rating' && !isThesis;
  const finished = tx !== null && debate.phase === 'finished' && !isThesis;

  return (
    <main className="debate">
      <AncestryRail debate={debate} focusedId={focus.id} onFocus={setFocusedId} />

      <section className={`focus ${isThesis ? 'focus-thesis' : `focus-${focus.side}`}`}>
        <p className="focus-kicker">
          {isThesis ? 'Thesis' : focus.side === 'pro' ? 'Pro argument' : 'Con argument'}
        </p>
        <h1 className="focus-text">{focus.text}</h1>
        <p className="focus-meta">
          Market approval{' '}
          <strong className="mono">{Math.round(focus.approval * 100)}%</strong> · weight{' '}
          <strong className="mono">{focus.weight} ⬡</strong>
        </p>
        {rating && tx && (
          <InvestPanel tokens={tx.tokens} onInvest={(side, amount) => tx.invest(focus.id, side, amount)} />
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
              <ArgumentCard key={node.id} debate={debate} node={node} onFocus={setFocusedId} />
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
              <ArgumentCard key={node.id} debate={debate} node={node} onFocus={setFocusedId} />
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
