import { centered, tallyOf } from './impact';
import { reservesOf } from './market';
import type { ArgumentNode, Debate } from '../types';

/**
 * An argument's four figures over the rating window, rebuilt from the stakes that produced them.
 *
 * Nothing is stored per instant on-chain, and nothing needs to be: a stake is exactly invertible.
 * The contract moves the reserves by `net = staked - fee` on one side and `net - sharesOut` on the
 * other, so subtracting those from the state we can see walks the market backwards through every
 * stake the index recorded. Starting from now and undoing to the window's opening reconstructs the
 * whole history without a single extra field in the schema.
 *
 * Every point is the tally's *projection* at that instant - what the verdict would have been had
 * the window closed there - never the settled figure. Once the tally has run it reads time-weighted
 * inputs (ADR-0013), so the settled rating parts from the closing projection on purpose; splicing
 * it onto the end of this series would put a step in the line that no stake caused. The settled
 * figure is in the facts beside the chart, which is where a single number belongs.
 */

/** One stake as the index recorded it, in the contract's units. */
export interface StakeEvent {
  argumentId: number;
  isPro: boolean;
  /** What the staker paid, fee included. */
  staked: number;
  fee: number;
  /** The shares the stake freed from the bought reserve. */
  sharesOut: number;
  /** Chain time, unix seconds. */
  at: number;
}

/** One instant, as the four series plot it. */
export interface HistoryPoint {
  at: number;
  /** The argument's own market price, centered so an undecided market is 0 (-1..1). */
  market: number;
  /** What the tally would have said had the window closed here (-1..1). */
  rating: number;
  /** Vote tokens on the argument's own market. */
  stake: number;
  /** Those plus every sub-argument's - the weight the tally would give this branch. */
  subtreeStake: number;
}

interface Reserves {
  pro: number;
  con: number;
  votes: number;
}

/**
 * The series for one argument across the rating window, oldest first. Empty without a clock (the
 * bundled sample) or without a window to plot.
 */
export function historyOf(debate: Debate, stakes: readonly StakeEvent[], argumentId: number): HistoryPoint[] {
  const { timing } = debate;
  if (!timing) {
    return [];
  }

  const state = new Map<number, Reserves>();
  for (const node of debate.nodes) {
    const { pro, con } = reservesOf(node);
    state.set(node.id, { pro, con, votes: node.weight });
  }

  /** The figures as the reconstructed markets stand, dated `at`. */
  const snapshot = (at: number): HistoryPoint => {
    const nodes: ArgumentNode[] = debate.nodes.map((node) => {
      const held = state.get(node.id) as Reserves;
      const size = held.pro + held.con;
      return {
        ...node,
        approval: size === 0 ? 0.5 : held.con / size,
        proReserve: held.pro,
        conReserve: held.con,
        weight: held.votes,
        // Project from the reconstructed market rather than replay the settled rating.
        rating: undefined,
        // Finality is the clock's, and the clock is at `at` here, not now.
        state: node.finalizationTime <= at ? 'final' : 'created',
      };
    });
    const tallies = tallyOf({ ...debate, nodes });
    const self = nodes.find((node) => node.id === argumentId) as ArgumentNode;
    const own = tallies.get(argumentId);
    return {
      at,
      market: centered(self.approval),
      rating: own?.rating ?? centered(self.approval),
      stake: self.weight,
      subtreeStake: own?.subtreeWeight ?? self.weight,
    };
  };

  /** Rewinds one stake: the contract's own arithmetic, run the other way. */
  const undo = (stake: StakeEvent): void => {
    const held = state.get(stake.argumentId);
    if (!held) {
      return;
    }
    const net = stake.staked - stake.fee;
    if (stake.isPro) {
      held.pro -= net - stake.sharesOut;
      held.con -= net;
    } else {
      held.con -= net - stake.sharesOut;
      held.pro -= net;
    }
    held.votes -= net;
  };

  // Only this debate's stakes, oldest first - the order the contract applied them in.
  const ordered = [...stakes].filter((stake) => state.has(stake.argumentId)).sort((a, b) => a.at - b.at);
  // Nothing has moved, so there is no history: a chart of two identical points would draw four flat
  // lines and say less than the figures beside it already do.
  if (ordered.length === 0) {
    return [];
  }

  // The right edge is now, or the window's close once it has passed: a debate does not keep moving
  // after the tally reads it.
  const points: HistoryPoint[] = [snapshot(Math.min(timing.chainTime, timing.ratingEndTime))];
  for (let i = ordered.length - 1; i >= 0; i--) {
    // The state here is the one this stake produced, so it dates from the moment it landed.
    points.push(snapshot(ordered[i]!.at));
    undo(ordered[i]!);
  }
  // Everything undone leaves the markets as their deposits seeded them, which is how the rating
  // window opened.
  points.push(snapshot(timing.editingEndTime));
  points.reverse();
  return points;
}
