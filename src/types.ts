export type Side = 'pro' | 'con';

export type Phase = 'editing' | 'rating' | 'tallying' | 'finished';

/** A created argument is still editable and has no tradeable market yet; a final one is locked in. */
export type ArgumentState = 'created' | 'final';

/** A node of the debate tree. The thesis is the node with `parentId: null`. */
export interface ArgumentNode {
  id: number;
  parentId: number | null;
  /** Whether this argument supports or attacks its parent. `null` for the thesis. */
  side: Side | null;
  text: string;
  /** The argument market's current pro share, 0..1. */
  approval: number;
  /** Vote tokens staked on this argument's market. */
  weight: number;
  /** Derived from the clock: `final` once `finalizationTime` has passed, `created` (draft) before. */
  state: ArgumentState;
  /** Chain time (unix seconds) from which the argument is final: locked in, tradeable, and tallied. */
  finalizationTime: number;
  /**
   * The creator's checksummed address (the thesis' creator created the debate).
   * Absent for bundled sample data, which has no accounts.
   */
  creator?: string;
}

/** The debate's on-chain phase clock, in unix seconds. */
export interface DebateTiming {
  editingEndTime: number;
  ratingEndTime: number;
  /**
   * Estimate of the next block's timestamp, from the chain head and the local
   * wall clock. A fast local clock can put it slightly ahead of the chain, so
   * it only decides what controls to SHOW - the action layer verifies effects
   * on-chain instead of trusting it.
   */
  chainTime: number;
  /** The wall time at which this estimate was taken, letting it advance between reloads. */
  loadedAt: number;
}

/**
 * The chain-clock estimate at wall time `now`: the load-time estimate advanced
 * by the wall time elapsed since. Time-warped dev chains run ahead of the wall
 * but still advance in real time, so the elapsed wall time carries the estimate
 * between reloads; the wall itself stays a floor.
 */
export function liveChainTime(timing: DebateTiming, now: number): number {
  return Math.max(now, timing.chainTime + Math.max(0, now - timing.loadedAt));
}

export interface Debate {
  id: number;
  phase: Phase;
  nodes: ArgumentNode[];
  /** Absent for bundled sample data, which has no chain to poke. */
  timing?: DebateTiming;
  /** Whether the debate confirmed the thesis. Only set once the phase is `finished`. */
  approved?: boolean;
}

/** A debate as it appears in the browse list. */
export interface DebateSummary {
  id: number;
  thesis: string;
  phase: Phase;
  /** Vote tokens committed to the debate's markets (deposits plus net stakes). */
  stake: number;
  argumentsCount: number;
  /** The creator's checksummed address; absent for bundled sample data. */
  creator?: string;
}

/** An account's share holding in one argument's market, for the batch-redeem flow. */
export interface AccountPosition {
  argumentId: number;
  proShares: number;
  conShares: number;
}

/** How the browse list is ordered: newest first, or most-staked first. */
export type DebateSort = 'recent' | 'stake';

/** The browse view's filter and sort settings. */
export interface DebateFilter {
  status: Phase | 'all';
  /** Case-insensitive substring of the creator's address; empty matches all. */
  author: string;
  sort: DebateSort;
}

/** Filters by status and author, then orders by the chosen sort (id breaks stake ties). */
export function filterDebates(debates: DebateSummary[], filter: DebateFilter): DebateSummary[] {
  const author = filter.author.trim().toLowerCase();
  const matched = debates.filter(
    (debate) =>
      (filter.status === 'all' || debate.phase === filter.status) &&
      (author === '' || (debate.creator ?? '').toLowerCase().includes(author)),
  );
  return matched.sort(
    filter.sort === 'stake' ? (a, b) => b.stake - a.stake || b.id - a.id : (a, b) => b.id - a.id,
  );
}

/** A permissionless phase transition that is currently open for anyone to trigger. */
export interface PhasePoke {
  /** `advance` maps to `advancePhase`, `tally` to `tallyTree` (the Finished transition). */
  kind: 'advance' | 'tally';
  target: Phase;
}

/**
 * The phase poke currently open on the debate, if any. `now` (wall unix
 * seconds, typically a ticking clock) lets the gate open live between reloads
 * via the advancing chain-time estimate.
 */
export function availablePhasePoke(debate: Debate, now?: number): PhasePoke | null {
  if (debate.phase === 'tallying') return { kind: 'tally', target: 'finished' };
  if (!debate.timing) return null;
  const { editingEndTime, ratingEndTime } = debate.timing;
  const time = now === undefined ? debate.timing.chainTime : liveChainTime(debate.timing, now);
  const stuckInEditing = debate.phase === 'editing';
  const stuckInRating = stuckInEditing || debate.phase === 'rating';
  if (stuckInRating && time > ratingEndTime) return { kind: 'advance', target: 'tallying' };
  if (stuckInEditing && time > editingEndTime) return { kind: 'advance', target: 'rating' };
  return null;
}

/**
 * Whether new arguments can still be added: the debate is in editing and its editing window has not
 * passed by the (live) clock. The window can close before the phase poke runs, and adding then reverts
 * (the phase has, or is about to, advance) or - in the not-yet-poked limbo - creates an argument that
 * can never finalize. Sample data without a clock is treated as open.
 */
export function editingOpen(debate: Debate, now?: number): boolean {
  if (debate.phase !== 'editing') return false;
  if (debate.timing === undefined) return true;
  const time = now === undefined ? debate.timing.chainTime : liveChainTime(debate.timing, now);
  return time <= debate.timing.editingEndTime;
}

export function thesisOf(debate: Debate): ArgumentNode {
  const thesis = debate.nodes.find((n) => n.parentId === null);
  if (!thesis) throw new Error(`Debate ${debate.id} has no thesis`);
  return thesis;
}

export function childrenOf(debate: Debate, id: number, side: Side): ArgumentNode[] {
  return debate.nodes.filter((n) => n.parentId === id && n.side === side);
}

/** Path from the thesis down to (and including) the given node. */
export function ancestryOf(debate: Debate, id: number): ArgumentNode[] {
  const byId = new Map(debate.nodes.map((n) => [n.id, n]));
  const path: ArgumentNode[] = [];
  let current = byId.get(id);
  while (current) {
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}

export const PHASE_LABEL: Record<Phase, string> = {
  editing: 'Editing phase',
  rating: 'Rating phase',
  tallying: 'Tallying phase',
  finished: 'Finished',
};
