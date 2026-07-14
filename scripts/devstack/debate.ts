/**
 * Debate scripts: a debate written down as the actions of its participants, and a runner
 * that replays it on-chain as if each persona performed their steps themselves - every
 * persona acts from its own account and joins the debate before its first action.
 * Arguments finalize automatically once their editing window elapses, so a child add
 * simply follows a wait step past its parent's window.
 */

import { createTestClient, http, publicActions, walletActions, type Abi, type Address, type Hex } from 'viem';
import { mnemonicToAccount, type HDAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

export type Side = 'pro' | 'con';

/** Adds an argument beneath `parent` (the thesis is addressed as 'thesis'), acting as `user`. */
export interface AddStep {
  kind: 'add';
  user: string;
  /** Symbolic key that later steps can reference as `parent` or `argument`. */
  key: string;
  parent: string;
  side: Side;
  /** The author's initial approval of the own argument in percent, 50..100. */
  approval: number;
  /** The vote token deposit that seeds the market and sets the starting weight; defaults to the minimum (10). */
  deposit?: number;
  text: string;
}

/** Advances chain time by whole debate time units (plus a second of slack). */
export interface WaitStep {
  kind: 'wait';
  timeUnits: number;
}

/** Stakes vote tokens on one side of an argument's market, acting as `user` (requires the Rating phase). */
export interface StakeStep {
  kind: 'stake';
  user: string;
  argument: string;
  side: Side;
  amount: number;
}

/** Tallies the argument tree, computing the outcome and finishing the debate (requires the Tallying phase). */
export interface TallyStep {
  kind: 'tally';
  user: string;
}

export type Step = AddStep | WaitStep | StakeStep | TallyStep;

export interface DebateScript {
  /** The debate's time unit in seconds. */
  timeUnitSeconds: number;
  /** Persona creating the debate. */
  creator: string;
  thesis: string;
  steps: Step[];
}

/** anvil's default, publicly known development mnemonic - local use only. */
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';


export function anvilAccount(index: number): HDAccount {
  return mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
}

export function devChainClient(rpcUrl: string) {
  // Fast polling, low cache: viem's block-number cache (default 4 s) would
  // otherwise delay every receipt wait by a full cache window on a warm client.
  return createTestClient({
    chain: foundry,
    mode: 'anvil',
    transport: http(rpcUrl),
    pollingInterval: 100,
    cacheTime: 100,
  })
    .extend(publicActions)
    .extend(walletActions);
}

export type DevChainClient = ReturnType<typeof devChainClient>;

export interface DebateRunnerOptions {
  client: DevChainClient;
  arborVote: Address;
  abi: Abi;
  /** Maps an argument text to its on-chain bytes32 contentURI (hashing plus optional pinning). */
  contentURI: (text: string) => Promise<Hex>;
  log: (line: string) => void;
}

export interface DebateRunResult {
  debateId: bigint;
  /** Personas in order of first appearance, mapped to their anvil accounts. */
  personas: Map<string, HDAccount>;
}

export async function runDebateScript(script: DebateScript, options: DebateRunnerOptions): Promise<DebateRunResult> {
  const { client, arborVote, abi, contentURI, log } = options;

  const personas = new Map<string, HDAccount>();
  const joined = new Set<string>();
  const argumentIds = new Map<string, number>();

  const account = (user: string): HDAccount => {
    let hdAccount = personas.get(user);
    if (!hdAccount) {
      hdAccount = anvilAccount(personas.size);
      personas.set(user, hdAccount);
    }
    return hdAccount;
  };

  /** Simulates, sends, and awaits a contract call as `user`, returning the simulated result. */
  const act = async (user: string, functionName: string, args: unknown[]): Promise<unknown> => {
    const { request, result } = await client.simulateContract({
      account: account(user),
      address: arborVote,
      abi,
      functionName,
      args,
    });
    const hash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash });
    return result;
  };

  // The script stays single-knob: the classic 7/3 split derives both phase durations from the
  // time unit, matching the step timeline's `wait` semantics.
  const debateId = (await act(script.creator, 'createDebate', [
    await contentURI(script.thesis),
    script.timeUnitSeconds,
    7 * script.timeUnitSeconds,
    3 * script.timeUnitSeconds,
  ])) as bigint;
  argumentIds.set('thesis', 0);
  log(`${script.creator} creates debate ${debateId}: "${script.thesis}"`);

  const join = async (user: string): Promise<void> => {
    if (joined.has(user)) {
      return;
    }
    await act(user, 'join', [debateId]);
    joined.add(user);
    log(`${user} joins`);
  };

  const getArgument = async (argumentId: number): Promise<{ state: number; finalizationTime: number }> =>
    (await client.readContract({
      address: arborVote,
      abi,
      functionName: 'getArgument',
      args: [debateId, argumentId],
    })) as { state: number; finalizationTime: number };

  const argumentId = (key: string): number => {
    const id = argumentIds.get(key);
    if (id === undefined) {
      throw new Error(`debate script references unknown argument "${key}"`);
    }
    return id;
  };

  for (const step of script.steps) {
    switch (step.kind) {
      case 'wait': {
        await client.increaseTime({ seconds: step.timeUnits * script.timeUnitSeconds + 1 });
        await client.mine({ blocks: 1 });
        log(`time advances by ${step.timeUnits} unit(s)`);
        break;
      }
      case 'add': {
        if (argumentIds.has(step.key)) {
          throw new Error(`debate script defines argument "${step.key}" twice`);
        }
        const parentId = argumentId(step.parent);
        // A parent is final once its editing window has elapsed (the thesis from creation), which is
        // what lets a child attach - so a child add must follow a wait past the parent's window.
        const parent = await getArgument(parentId);
        const now = Number((await client.getBlock()).timestamp);
        if (Number(parent.finalizationTime) > now) {
          throw new Error(`parent "${step.parent}" of "${step.key}" is not final yet - add a wait step first`);
        }
        await join(step.user);
        const deposit = step.deposit ?? 10;
        const newId = (await act(step.user, 'addArgument', [
          debateId,
          parentId,
          await contentURI(step.text),
          step.side === 'pro',
          step.approval,
          deposit,
        ])) as number;
        argumentIds.set(step.key, newId);
        log(
          `${step.user} adds ${step.side} "${step.key}" (${step.approval}%, ${deposit} ⬡) under "${step.parent}" -> id ${newId}`,
        );
        break;
      }
      case 'stake': {
        await join(step.user);
        await act(step.user, step.side === 'pro' ? 'stakePro' : 'stakeCon', [
          debateId,
          argumentId(step.argument),
          step.amount,
        ]);
        log(`${step.user} stakes ${step.amount} on ${step.side} of "${step.argument}"`);
        break;
      }
      case 'tally': {
        await act(step.user, 'tallyTree', [debateId]);
        log(`${step.user} tallies the debate`);
        break;
      }
    }
  }

  return { debateId, personas };
}
