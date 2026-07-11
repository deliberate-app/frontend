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
  state: ArgumentState;
  /** Chain time (unix seconds) from which the argument can be finalized; 0 once final. */
  finalizationTime: number;
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

/** A permissionless phase transition that is currently open for anyone to trigger. */
export interface PhasePoke {
  /** `advance` maps to `advancePhase`, `tally` to `tallyTree` (the Finished transition). */
  kind: 'advance' | 'tally';
  target: Phase;
}

/**
 * The phase poke currently open on the debate, if any. `atTime` (unix seconds,
 * typically a ticking wall clock) lets the gate open live between reloads;
 * the load-time chain estimate is always honored as a lower bound.
 */
export function availablePhasePoke(debate: Debate, atTime?: number): PhasePoke | null {
  if (debate.phase === 'tallying') return { kind: 'tally', target: 'finished' };
  if (!debate.timing) return null;
  const { chainTime, editingEndTime, ratingEndTime } = debate.timing;
  const time = Math.max(chainTime, atTime ?? 0);
  const stuckInEditing = debate.phase === 'editing';
  const stuckInRating = stuckInEditing || debate.phase === 'rating';
  if (stuckInRating && time > ratingEndTime) return { kind: 'advance', target: 'tallying' };
  if (stuckInEditing && time > editingEndTime) return { kind: 'advance', target: 'rating' };
  return null;
}

/** Whether the permissionless finalize poke is open for this argument (`atTime` as above). */
export function finalizable(node: ArgumentNode, debate: Debate, atTime?: number): boolean {
  return (
    node.state === 'created' &&
    debate.phase !== 'finished' &&
    debate.timing !== undefined &&
    Math.max(debate.timing.chainTime, atTime ?? 0) >= node.finalizationTime
  );
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
