import type { ArgumentNode, Debate } from '../types';
import { childrenOf, thesisOf } from '../types';

/** What the tally says about one argument. */
export interface NodeTally {
  /**
   * The tally's verdict: the argument's own market approval corrected by its sub-arguments, each
   * counted by the stake behind it. Negative means refuted. Equal to the centered approval while
   * an argument is undebated - and, once the tally has run, the stored settlement rating, which is
   * time-weighted and so parts from the closing price even without sub-arguments.
   */
  rating: number;
  /**
   * What the argument moves its parent's rating by: its rating clamped at neutral, signed by its
   * stance, at its subtree's share of the siblings' stake. Zero for the thesis, which has no parent.
   */
  impact: number;
  /**
   * The stake behind the rating: the argument's own market stake plus every sub-argument's, which
   * is what the tally weighs the blend by. Equal to the argument's own stake while it is undebated.
   */
  subtreeWeight: number;
}

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
 * Values are fractions of the full scale, so they live in -1..1. Once the tally has run, every
 * argument carries its stored settlement rating and the mirror uses it verbatim - the tally
 * reads time-weighted prices and stakes (ADR-0013), which closing-price arithmetic cannot
 * reconstruct. Before then this is a live projection from the standing prices and stakes: what
 * the tally would say if the market held here for the rest of the window.
 */
export function tallyOf(debate: Debate): Map<number, NodeTally> {
  const tallies = new Map<number, NodeTally>();

  /** The node's tallied rating and subtree stake; fills the map with its children's tallies. */
  const subtree = (node: ArgumentNode): { rating: number; weight: number } => {
    const children = [...childrenOf(debate, node.id, 'pro'), ...childrenOf(debate, node.id, 'con')]
      .filter((child) => child.state === 'final')
      .map((child) => {
        const sub = subtree(child);
        // The clamp: refuted (negative rating) folds as zero strength - silenced, never
        // handed to the other side - while the stance decides the sign of what remains.
        const strength = Math.max(sub.rating, 0);
        return { child, signed: child.side === 'con' ? -strength : strength, weight: sub.weight, rating: sub.rating };
      });
    const drafts = [...childrenOf(debate, node.id, 'pro'), ...childrenOf(debate, node.id, 'con')].filter(
      (child) => child.state === 'created',
    );
    for (const draft of drafts) {
      // A draft weighs nothing and moves nothing, but it has a market, so it has a rating of its
      // own - and it cannot have been replied to, so nothing corrects it.
      tallies.set(draft.id, { rating: 2 * draft.approval - 1, impact: 0, subtreeWeight: draft.weight });
    }

    const childrenWeight = children.reduce((sum, { weight }) => sum + weight, 0);
    let descendants = 0;
    for (const { child, signed, weight, rating } of children) {
      const share = childrenWeight === 0 ? 0 : weight / childrenWeight;
      // `|| 0` normalizes the negative zero a clamped con argument produces: there is no such
      // thing as a negatively-zero impact, and -0 compares unequal to 0 for anything downstream.
      tallies.set(child.id, { rating, impact: signed * share || 0, subtreeWeight: weight });
      descendants += signed * share;
    }

    const centered = 2 * node.approval - 1;
    const total = node.weight + childrenWeight;
    const projected =
      total === 0
        ? centered
        : (centered * node.weight + descendants * childrenWeight) / total;
    // The stored settlement rating, once the tally has written it, replaces the projection.
    const rating = node.rating ?? projected;
    return { rating, weight: total };
  };

  const thesis = thesisOf(debate);
  const { rating, weight } = subtree(thesis);
  // The thesis has no market of its own, so its rating is the pure descendants aggregate - and an
  // argument-less debate reads as a neutral ±0 by construction. It has no parent to move.
  tallies.set(thesis.id, { rating: weight === 0 ? 0 : rating, impact: 0, subtreeWeight: weight });
  return tallies;
}

/** The tooltip on the parent-impact figure, shared by every place it appears. */
export const IMPACT_HINT =
  "How much this argument moves its parent's rating: its own rating at its share of the siblings' " +
  'stake, signed by the side it takes; a refuted argument moves nothing.';

/** The tooltip on an argument's rating figure. */
export const RATING_HINT =
  "The debate's verdict on this argument: its market rating corrected by its sub-arguments, each " +
  'counted by the stake behind it. This is what its shares settle against.';

/** The tooltip on the thesis' rating figure - it has no market, so its rating is its arguments'. */
export const THESIS_RATING_HINT =
  "The debate's verdict: the top-level arguments' impacts, weighted by their stake. Above zero " +
  'confirms the thesis, at or below objects it.';

/** The tooltip on an argument's own market figure. */
export const MARKET_HINT =
  'What this argument\'s market alone says, before its sub-arguments are counted: the price of a ' +
  'good-argument share, centered so an undecided market reads ±0%.';

/**
 * A market's 0..1 price on the signed scale the rest of the app speaks: 0.5 becomes ±0, a fully
 * backed argument +1. Since ADR-0012 this is the tally's own scale rather than a display
 * convention, which is why it lives here and not in whichever component last needed it.
 */
export const centered = (approval: number) => 2 * approval - 1;

/**
 * Where a signed value sits on a centre-anchored axis, as a percentage of its width: −1 at the
 * left edge, 0 at the middle, +1 at the right. Shared by every axis on the page, so the gauge and
 * the stake slider cannot disagree about where a figure belongs.
 */
export function axisPercent(value: number): number {
  return 50 + Math.max(-1, Math.min(1, value)) * 50;
}

/** The class that colours a figure by its sign; neutral takes neither stance colour. */
export const signClassOf = (value: number) => (value > 0 ? 'impact-pos' : value < 0 ? 'impact-neg' : '');

/**
 * Whether two figures on this scale would be read as different. Every view that decides whether a
 * correction is worth drawing, saying, or listing asks it here, so a bar cannot draw a correction
 * its own tooltip denies: the question is what the reader sees, and the formatter decides that.
 */
export const readsDifferently = (a: number, b: number) => formatImpact(a) !== formatImpact(b);

/** An argument's figures as every view reads them, with the tally's fallbacks applied once. */
export interface NodeFigures {
  /** The argument's own market price, centered so an undecided market is 0. */
  market: number;
  /** The debate's verdict on it: the market corrected by its sub-debate, or the market itself. */
  rating: number;
  /** Vote tokens on its own market. */
  stake: number;
  /** Those plus every sub-argument's - the weight the tally gives this branch. */
  subtreeStake: number;
  /**
   * Whether a sub-debate moved the rating. A correction is something sub-arguments did, so there
   * has to be one: with no stake beneath it nothing was weighed against the argument's own market,
   * and the gap the settled rating leaves is the tally's time-weighting, which no sub-argument
   * caused and no figure should credit to one.
   */
  corrected: boolean;
}

/**
 * The four figures of one argument. The fallbacks - an undebated argument's rating is its own
 * market price, and its branch is itself - are the tally's contract rather than any one view's, so
 * every view reads them from here instead of restating them.
 */
export function figuresOf(node: ArgumentNode, tally?: NodeTally): NodeFigures {
  const market = centered(node.approval);
  const subtreeStake = tally?.subtreeWeight ?? node.weight;
  return {
    market,
    rating: tally?.rating ?? market,
    stake: node.weight,
    subtreeStake,
    corrected: subtreeStake > node.weight,
  };
}

/** Formats an impact or rating fraction as a signed percentage, e.g. "+12%". */
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
  return formatImpact(centered(approval));
}
