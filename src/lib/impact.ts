import type { ArgumentNode, Debate } from '../types';
import { childrenOf, thesisOf } from '../types';

/**
 * A client-side mirror of the on-chain tally (ADR-0011, ADR-0012), computable at any time.
 *
 * Everything lives on one signed scale whose zero is the market's undecided price: an argument's
 * own centered approval (2a − 1) blends with its descendants' aggregate, weighted by the stake
 * behind each, into its tallied rating — negative meaning refuted. What a child exerts on its
 * parent is its sway: the rating clamped at neutral (a refuted argument sways nothing rather
 * than aiding the other side), signed by its stance, at its subtree's share of the siblings'
 * stake — and a refuted child keeps its weight in that share, dampening its neighborhood.
 * Draft (unfinalized) arguments contribute nothing and weigh nothing until they lock in — the
 * tally never sees one.
 *
 * Values are fractions of the full scale, so they live in -1..1. During the rating this is a
 * live preview; after the tally it mirrors the final result.
 */
export function impactsOf(debate: Debate): Map<number, number> {
  const impacts = new Map<number, number>();

  /** The node's tallied rating and subtree stake; fills the map with its children's sways. */
  const subtree = (node: ArgumentNode): { rating: number; weight: number } => {
    const children = [...childrenOf(debate, node.id, 'pro'), ...childrenOf(debate, node.id, 'con')]
      .filter((child) => child.state === 'final')
      .map((child) => {
        const sub = subtree(child);
        // The clamp: refuted (negative rating) folds as zero strength - silenced, never
        // handed to the other side - while the stance decides the sign of what remains.
        const strength = Math.max(sub.rating, 0);
        return { child, signed: child.side === 'con' ? -strength : strength, weight: sub.weight };
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

    const centered = 2 * node.approval - 1;
    const total = node.weight + childrenWeight;
    const rating =
      total === 0
        ? centered
        : (centered * node.weight + descendants * childrenWeight) / total;
    return { rating, weight: total };
  };

  const thesis = thesisOf(debate);
  const { rating, weight } = subtree(thesis);
  // The thesis has no market of its own, so its rating is the pure descendants aggregate -
  // and an argument-less debate reads as a neutral ±0 by construction.
  impacts.set(thesis.id, weight === 0 ? 0 : rating);
  return impacts;
}

/** The tooltip explaining an argument's sway figure, shared by every place it appears. */
export const IMPACT_HINT =
  "How much this argument sways its parent's rating in the tally: its own rating - approval " +
  'corrected by its sub-arguments, each weighted by the stake behind it - counted at its ' +
  "subtree's share of the siblings' stake. Green sways the parent up, red down; a refuted " +
  'argument sways nothing.';

/** The tooltip explaining the thesis' net sway figure. */
export const NET_IMPACT_HINT =
  "The top-level arguments' sways blended by the stake behind each: above zero the thesis is " +
  'confirmed, at or below it is objected.';

/** Formats a sway or rating fraction as a signed percentage, e.g. "+12%". */
export function formatImpact(impact: number): string {
  const percent = Math.round(impact * 100);
  return percent > 0 ? `+${percent}%` : percent < 0 ? `−${Math.abs(percent)}%` : '±0%';
}

/**
 * Formats a market approval (0..1, where 0.5 is neutral) as a signed percentage centered on
 * neutral: 50% reads as ±0%, a fully backed argument as +100%, a fully rejected one as −100%.
 * Since ADR-0012 this is the tally's own scale, not merely a display convention - a childless
 * argument's rating IS its centered approval.
 */
export function formatApproval(approval: number): string {
  return formatImpact(2 * approval - 1);
}
