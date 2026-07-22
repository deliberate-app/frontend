import type { ArgumentNode, Debate } from '../types';
import { childrenOf, thesisOf } from '../types';

/**
 * A client-side mirror of the on-chain tally (ADR-0011), computable at any time: an argument's
 * blended rating mixes its own approval and its descendants' aggregate weighted by the stake
 * behind each, and what it adds to its parent is that blend, signed by its stance and weighted
 * by its subtree's share of the siblings' stake. A childless argument sways with its full
 * approval. Draft (unfinalized) arguments contribute nothing and weigh nothing until they lock
 * in - the tally never sees one.
 *
 * Values are fractions of a full approval, so they live in -1..1. During the
 * rating this is a live preview; after the tally it mirrors the final result.
 */
export function impactsOf(debate: Debate): Map<number, number> {
  const impacts = new Map<number, number>();

  /** The node's blended rating and subtree stake; fills the map with its children's sways. */
  const subtree = (node: ArgumentNode): { blend: number; weight: number } => {
    const children = [...childrenOf(debate, node.id, 'pro'), ...childrenOf(debate, node.id, 'con')]
      .filter((child) => child.state === 'final')
      .map((child) => {
        const sub = subtree(child);
        return { child, signed: child.side === 'con' ? -sub.blend : sub.blend, weight: sub.weight };
      });
    const drafts = [...childrenOf(debate, node.id, 'pro'), ...childrenOf(debate, node.id, 'con')].filter(
      (child) => child.state === 'created',
    );
    for (const draft of drafts) {
      impacts.set(draft.id, 0);
    }

    const childrenWeight = children.reduce((sum, { weight }) => sum + weight, 0);
    let descendants = 0;
    for (const { child, signed, weight } of children) {
      const share = childrenWeight === 0 ? 0 : weight / childrenWeight;
      impacts.set(child.id, signed * share);
      descendants += signed * share;
    }

    const total = node.weight + childrenWeight;
    const blend =
      total === 0
        ? node.approval
        : (node.approval * node.weight + descendants * childrenWeight) / total;
    return { blend, weight: total };
  };

  const thesis = thesisOf(debate);
  const { blend, weight } = subtree(thesis);
  // The thesis has no market of its own, so its blend is the pure descendants aggregate -
  // and an argument-less debate reads as a neutral ±0, not as the market-less 50%.
  impacts.set(thesis.id, weight === 0 ? 0 : blend);
  return impacts;
}

/** The tooltip explaining an argument's impact figure, shared by every place it appears. */
export const IMPACT_HINT =
  "How much this argument sways its parent's rating in the tally: its own rating blended with " +
  'what its sub-arguments add - each weighted by the stake behind it - counted at its ' +
  "subtree's share of the siblings' stake. Green sways the parent up, red down.";

/** The tooltip explaining the thesis' net impact figure. */
export const NET_IMPACT_HINT =
  "The top-level arguments' sways blended by the stake behind each: above zero the thesis is " +
  'confirmed, below it is objected.';

/** Formats an impact fraction as a signed percentage, e.g. "+12%". */
export function formatImpact(impact: number): string {
  const percent = Math.round(impact * 100);
  return percent > 0 ? `+${percent}%` : percent < 0 ? `−${Math.abs(percent)}%` : '±0%';
}

/**
 * Formats a market approval (0..1, where 0.5 is neutral) as a signed percentage centered on neutral,
 * mirroring the sway: 50% reads as ±0%, a fully backed argument as +100%, a fully rejected one as −100%.
 */
export function formatApproval(approval: number): string {
  return formatImpact(2 * approval - 1);
}
