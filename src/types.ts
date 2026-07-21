export type Side = 'pro' | 'con';

export type Phase = 'editing' | 'rating' | 'tallying' | 'finished';

/** A created argument is a draft, still editable and movable; a final one is locked in. */
export type ArgumentState = 'created' | 'final';

/** Shortens a content digest to `0x2a3a…0683` - the first and last 4 hex digits. */
export const shortDigest = (digest: string) => `${digest.slice(0, 6)}…${digest.slice(-4)}`;

/** A node of the debate tree. The thesis is the node with `parentId: null`. */
export interface ArgumentNode {
  id: number;
  parentId: number | null;
  /** Whether this argument supports or attacks its parent. `null` for the thesis. */
  side: Side | null;
  /** The resolved content text, or - when the content could not be resolved - the shortened digest. */
  text: string;
  /** The on-chain content digest (`0x…`), set only when the content could not be resolved from IPFS. */
  contentDigest?: string;
  /** The rating market's current pro share, 0..1. */
  approval: number;
  /** Vote tokens staked on this argument's market. */
  weight: number;
  /** Derived from the clock: `final` once `finalizationTime` has passed, `created` (draft) before. */
  state: ArgumentState;
  /**
   * Chain time (unix seconds) from which the argument is final: locked against edits and moves,
   * stakeable once the rating phase runs, and counted by the tally.
   */
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

/** Mirrors the contract's `Parameters.CLAIM_WINDOW`: bounty claims close this long after the tally. */
export const CLAIM_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/** A debate's ERC-20 bounty, with the token's display identity resolved. */
export interface DebateBounty {
  /** The checksummed token address. */
  token: string;
  symbol: string;
  decimals: number;
  /** The total amount funded, in raw token units. */
  pool: bigint;
  /** The total paid out to claimants so far, in raw token units. */
  claimed: bigint;
  /** Whether the creator has swept the unclaimed remainder. */
  swept: boolean;
  /** Unix seconds the claim window closes; 0 while the debate is unfinished. */
  claimEndTime: number;
}

export interface Debate {
  id: number;
  phase: Phase;
  nodes: ArgumentNode[];
  /** Absent for bundled sample data, which has no chain to poke. */
  timing?: DebateTiming;
  /** Whether the debate confirmed the thesis. Only set once the phase is `finished`. */
  approved?: boolean;
  /** The debate's bounty; absent when none is attached. */
  bounty?: DebateBounty;
  /** The number of joined accounts - the N in the bounty payout denominator. */
  participantsCount?: number;
}

/** A debate as it appears in the browse list. */
export interface DebateSummary {
  id: number;
  /** The resolved thesis text, or - when unresolved - the shortened content digest. */
  thesis: string;
  /** The on-chain content digest (`0x…`), set only when the thesis content could not be resolved. */
  contentDigest?: string;
  phase: Phase;
  /** The finished debate's outcome (thesis confirmed or objected); undefined until the tally has run. */
  approved?: boolean;
  /** Vote tokens committed to the debate's markets (deposits plus net stakes). */
  stake: number;
  argumentsCount: number;
  /** The debate's bounty; absent when none is attached. */
  bounty?: DebateBounty;
  /** The creator's checksummed address; absent for bundled sample data. */
  creator?: string;
}

/** An account's share holding in one argument's market, for the batch-redeem flow. */
export interface AccountPosition {
  argumentId: number;
  proShares: number;
  conShares: number;
}

/** How the browse list is ordered: newest first, most-staked first, or highest bounty first. */
export type DebateSort = 'recent' | 'stake' | 'bounty';

/** The browse view's filter and sort settings. */
export interface DebateFilter {
  status: Phase | 'all';
  /** Case-insensitive substring of the thesis text; empty matches all. */
  thesis: string;
  /** Case-insensitive substring of the creator's address; empty matches all. */
  author: string;
  sort: DebateSort;
}

/**
 * A bounty's size in whole tokens, for ordering: unit-normalized (pool over the token's decimals),
 * NOT value-normalized - without a price oracle, 50 USDC ranks above 0.5 WETH. Bounty-less debates
 * order last.
 */
export function bountyValueOf(debate: DebateSummary): number {
  return debate.bounty ? Number(debate.bounty.pool) / 10 ** debate.bounty.decimals : -1;
}

/** Filters by status, thesis text, and author, then orders by the chosen sort (id breaks ties). */
export function filterDebates(debates: DebateSummary[], filter: DebateFilter): DebateSummary[] {
  const thesis = filter.thesis.trim().toLowerCase();
  const author = filter.author.trim().toLowerCase();
  const matched = debates.filter(
    (debate) =>
      (filter.status === 'all' || debate.phase === filter.status) &&
      (thesis === '' || debate.thesis.toLowerCase().includes(thesis)) &&
      (author === '' || (debate.creator ?? '').toLowerCase().includes(author)),
  );
  return matched.sort(
    filter.sort === 'stake'
      ? (a, b) => b.stake - a.stake || b.id - a.id
      : filter.sort === 'bounty'
        ? (a, b) => bountyValueOf(b) - bountyValueOf(a) || b.id - a.id
        : (a, b) => b.id - a.id,
  );
}

/**
 * Derives a debate's phase the way the contract does: Editing, Rating, and Tallying follow purely from
 * the two time gates, and only the terminal Finished phase is a stored fact (set once the tally has run).
 */
export function phaseOf(editingEndTime: number, ratingEndTime: number, finished: boolean, time: number): Phase {
  if (finished) return 'finished';
  if (time > ratingEndTime) return 'tallying';
  if (time > editingEndTime) return 'rating';
  return 'editing';
}

/**
 * The one debate transition anyone can trigger: the tally, which finishes the debate. The earlier
 * Editing→Rating→Tallying transitions advance by the clock alone and need no transaction.
 */
export interface PhasePoke {
  kind: 'tally';
  target: 'finished';
}

/**
 * Whether the tally is open: the (live) clock has passed the rating window but the debate has not
 * finished yet. `now` (wall unix seconds, typically a ticking clock) lets the gate open live between
 * reloads via the advancing chain-time estimate; sample data without a clock falls back to the phase.
 */
export function availablePhasePoke(debate: Debate, now?: number): PhasePoke | null {
  if (debate.phase === 'finished') return null;
  if (!debate.timing) {
    return debate.phase === 'tallying' ? { kind: 'tally', target: 'finished' } : null;
  }
  const time = now === undefined ? debate.timing.chainTime : liveChainTime(debate.timing, now);
  return time > debate.timing.ratingEndTime ? { kind: 'tally', target: 'finished' } : null;
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
