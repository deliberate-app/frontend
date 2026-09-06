/**
 * The transaction layer: every state-changing debate interaction the app can perform,
 * bound to a connected wallet account. Each action simulates first (surfacing contract
 * errors before any signature prompt), sends, and waits for inclusion. Authoring sends the
 * text itself: the contract publishes it in the event and keeps nothing, so there is no
 * content pipeline in front of the transaction - only the bounds it would reject.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  erc20Abi,
  http,
  parseEventLogs,
  zeroAddress,
  type Abi,
  type Address,
  type TransactionReceipt,
} from 'viem';

import abi from '../abi/Deliberate.abi.json';
import factoryAbi from '../abi/IdentityRegistryFactory.abi.json';
import allowlistAbi from '../abi/AllowlistIdentityRegistry.abi.json';
import { deploymentChain } from '../lib/chains';
import type { DebateSchedule } from '../lib/debateTiming';
import { contentError } from '../lib/content';
import type { Side } from '../types';
import type { Signer } from '../wallet/signer';
import type { ContractConfig } from './config';
import { waitForIndexerBlock } from './source';

export interface UserState {
  joined: boolean;
  tokens: number;
  /** Whether the account has claimed its bounty share (claims are one-shot). */
  bountyClaimed: boolean;
}

export interface ArgumentPosition {
  proShares: number;
  conShares: number;
  /** Unclaimed market fees, when the account is the argument's creator. */
  claimableFees: number;
}

/** One account's standing on an allowlist, as `setMembership` writes it. */
export interface MembershipChange {
  account: Address;
  member: boolean;
}

export interface DebateActions {
  account: Address;
  /**
   * Creates a debate around a thesis with the given schedule - optionally attaching an ERC-20
   * bounty, which first asks for a token approval when the allowance does not cover the amount -
   * and returns the new debate's ID.
   */
  /**
   * Creates a debate. `identityRegistry` decides who may join: the zero address leaves it open to
   * everyone, any other address is asked `isRegistered` on each join.
   */
  createDebate(
    thesis: string,
    schedule: DebateSchedule,
    feePercentage: number,
    identityRegistry: Address,
    bounty?: BountyFunding,
  ): Promise<number>;
  join(debateId: number): Promise<void>;
  /**
   * Clones an allowlist registry owned by this account from the deployment's factory and returns
   * its address. Rejects where the deployment has no factory.
   */
  createAllowlistRegistry(): Promise<Address>;
  /**
   * Clones a Circles registry from the deployment's factory and returns its address: `anchor` is
   * the avatar whose trust admits an account (the zero address admits every registered human), and
   * `requireHuman` whether an admitted account must also be a registered human.
   */
  createCirclesRegistry(anchor: Address, requireHuman: boolean): Promise<Address>;
  /** Sets the standing of several accounts on an allowlist this account owns, in one transaction. */
  setMembership(registry: Address, changes: MembershipChange[]): Promise<void>;
  /** Authors an argument beneath a parent; the text goes to the chain as it is, within its bounds. */
  createArgument(
    debateId: number,
    parentArgumentId: number,
    side: Side,
    initialApproval: number,
    deposit: number,
    text: string,
  ): Promise<void>;
  /** Edits a still-draft argument's text (creator only, Editing phase). */
  alterArgument(debateId: number, argumentId: number, text: string): Promise<void>;
  /**
   * Moves a still-draft argument below a finalized parent, re-seeding its market at
   * `initialApproval` (creator only, Editing phase). Pass the current approval to keep it.
   */
  moveArgument(
    debateId: number,
    argumentId: number,
    newParentArgumentId: number,
    initialApproval: number,
  ): Promise<void>;
  stake(debateId: number, argumentId: number, side: Side, amount: number): Promise<void>;
  redeemShares(debateId: number, argumentId: number): Promise<void>;
  /** Redeems the account's shares across several arguments of a finished debate in one transaction. */
  redeemSharesBatch(debateId: number, argumentIds: number[]): Promise<void>;
  claimFees(debateId: number, argumentId: number): Promise<void>;
  /**
   * The one permissionless poke: anyone may tally a debate once its rating window closes, finishing it.
   * The earlier Editing→Rating→Tallying transitions advance by the clock alone and need no transaction.
   */
  tallyTree(debateId: number): Promise<void>;
  /** Tops up a finished-not-yet debate's bounty pool (approval asked first when needed). */
  fundBounty(debateId: number, token: Address, amount: bigint): Promise<void>;
  /**
   * Settles the given argument positions (shares and accrued own-argument fees) and claims the
   * account's bounty share in one transaction - one-shot, within the claim window.
   */
  claimBounty(debateId: number, argumentIds: number[]): Promise<void>;
  /** Sweeps the unclaimed bounty remainder to the creator once the claim window is over. */
  sweepBounty(debateId: number): Promise<void>;
}

/** A bounty attachment: the ERC-20 and the raw amount to pull from the creator. */
export interface BountyFunding {
  token: Address;
  amount: bigint;
}

/**
 * The gas limit to send a call with, given its estimate.
 *
 * An estimate is not a safe limit: a stake's cost depends on the clock. The market's standing
 * price and stake earn their held duration into two accumulators, and a stake estimated in the
 * same second as that argument's last accrual finds nothing to write - so the estimator misses
 * the two stores the transaction performs when it is mined a block or two later, and a limit set
 * to the estimate is twenty thousand gas short: the stake is mined reverted, out of gas, mid
 * rating window. Half again covers far more than that gap and costs nothing unused - the limit is
 * not the price. Leaving the limit to the wallet is no answer either: some wallets pad, some send
 * the bare estimate, and the app cannot tell which one signed.
 */
export function gasLimitFor(estimate: bigint): bigint {
  return (estimate * 150n) / 100n;
}

export async function connectDebateActions(config: ContractConfig, signer: Signer): Promise<DebateActions> {
  const account = signer.account;
  // Fast polling, low cache: viem serves block numbers from a per-client cache
  // (default 4 s), which would delay every receipt wait by a full cache window
  // once the cache is warm - sequential transactions crawl on instant-mining chains.
  const publicClient = createPublicClient({
    transport: http(config.rpcUrl),
    pollingInterval: 500,
    cacheTime: 500,
  });
  const chainId = await publicClient.getChainId();
  const chain = deploymentChain(chainId, config.rpcUrl);

  // Simulates (surfacing reverts before any signature), sends, and waits for the
  // receipt. Returns the receipt so callers can read the *mined* effects from the
  // events - the simulation's return value reflects pre-transaction state and can
  // be stale by the time the transaction lands.
  const writeTo = async (
    target: { address: Address; abi: Abi },
    functionName: string,
    args: unknown[],
    opts: { settle?: boolean } = {},
  ): Promise<TransactionReceipt> => {
    await signer.ensureChain(chain);
    const call = { address: target.address, abi: target.abi, functionName, args };
    // Simulating surfaces a revert before anything is signed; the estimate only sets the limit.
    const [, estimate] = await Promise.all([
      publicClient.simulateContract({ ...call, account }),
      publicClient.estimateContractGas({ ...call, account }),
    ]);
    const hash = await signer.send(call, gasLimitFor(estimate));
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // A mined transaction can still revert when another one beat it in a race.
    if (receipt.status === 'reverted') {
      throw new Error('The transaction was mined but reverted - someone else probably got there first.');
    }
    // Wait for the indexer to fold the transaction's block before returning, so the caller's
    // follow-up read reflects it - the fix for post-write freshness across every action. A slow
    // or unreachable indexer bails (the read layer's chain fallback is already fresh); join opts
    // out via `settle: false` because it updates optimistically instead.
    if (opts.settle !== false && config.indexerUrl) {
      await waitForIndexerBlock(config.indexerUrl, receipt.blockNumber);
    }
    return receipt;
  };
  const write = (functionName: string, args: unknown[], opts: { settle?: boolean } = {}) =>
    writeTo({ address: config.address, abi: abi as Abi }, functionName, args, opts);

  /** The factory to clone registries from, or the reason there is none to ask. */
  const factory = (): { address: Address; abi: Abi } => {
    if (!config.registryFactory) {
      throw new Error('This network has no registry factory, so no new registry can be made here.');
    }
    return { address: config.registryFactory, abi: factoryAbi as Abi };
  };

  /** The registry a factory transaction created, read from the event it emitted once mined. */
  const createdRegistry = (receipt: TransactionReceipt, eventName: string): Address => {
    const [created] = parseEventLogs({ abi: factoryAbi as Abi, eventName, logs: receipt.logs });
    const registry = (created as { args?: { registry?: Address } } | undefined)?.args?.registry;
    if (registry === undefined) {
      throw new Error('The registry was created but its address could not be read from the transaction.');
    }
    return registry;
  };

  /** The text as content, or the reason it cannot be - said here, before a simulate learns it in bytes. */
  const checked = (text: string): string => {
    const problem = contentError(text);
    if (problem) {
      throw new Error(problem);
    }
    return text;
  };

  /** Approves the contract for a token amount when the current allowance does not cover it. */
  const approveIfNeeded = async (token: Address, amount: bigint): Promise<void> => {
    await signer.ensureChain(chain);
    const allowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account, config.address],
    });
    if (allowance >= amount) {
      return;
    }
    const approval = { address: token, abi: erc20Abi as Abi, functionName: 'approve', args: [config.address, amount] };
    await publicClient.simulateContract({ ...approval, account });
    const hash = await signer.send(approval);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      throw new Error('The token approval was mined but reverted.');
    }
    // A load-balanced RPC can serve the next read from a replica still behind the approval's block,
    // so the follow-up transaction's simulate would see the old (too-low) allowance and revert with
    // the token's "insufficient allowance". Wait until the raised allowance is observable (bounded).
    for (let attempt = 0; attempt < 8; attempt++) {
      const settled = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [account, config.address],
      });
      if (settled >= amount) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  };

  return {
    account,

    async createDebate(thesis, schedule, feePercentage, identityRegistry, bounty) {
      const content = checked(thesis);
      if (bounty && bounty.amount > 0n) {
        await approveIfNeeded(bounty.token, bounty.amount);
      }
      const receipt = await write('createDebate', [
        content,
        BigInt(schedule.lockingDuration),
        BigInt(schedule.editingDuration),
        BigInt(schedule.ratingDuration),
        feePercentage,
        identityRegistry,
        bounty?.token ?? zeroAddress,
        bounty?.amount ?? 0n,
      ]);
      // The counter-assigned id is only known once mined: a debate created by
      // someone else between simulation and inclusion would shift it, so read it
      // from the DebateCreated event rather than the simulation's return value.
      const [created] = parseEventLogs({
        abi: abi as Abi,
        eventName: 'DebateCreated',
        logs: receipt.logs,
      });
      const debateId = (created as { args?: { debateId?: bigint } } | undefined)?.args?.debateId;
      if (debateId === undefined) {
        throw new Error('The debate was created but its id could not be read from the transaction.');
      }
      return Number(debateId);
    },

    async createAllowlistRegistry() {
      const receipt = await writeTo(factory(), 'createAllowlistRegistry', [account]);
      return createdRegistry(receipt, 'AllowlistRegistryCreated');
    },

    async createCirclesRegistry(anchor, requireHuman) {
      const receipt = await writeTo(factory(), 'createCirclesRegistry', [anchor, requireHuman]);
      return createdRegistry(receipt, 'CirclesRegistryCreated');
    },

    async setMembership(registry, changes) {
      await writeTo({ address: registry, abi: allowlistAbi as Abi }, 'setMembership', [changes]);
    },

    async join(debateId) {
      // Join reflects optimistically in the UI, so it need not wait on the indexer.
      await write('join', [BigInt(debateId)], { settle: false });
    },

    async createArgument(debateId, parentArgumentId, side, initialApproval, deposit, text) {
      await write('createArgument', [
        BigInt(debateId),
        parentArgumentId,
        checked(text),
        side === 'pro',
        initialApproval,
        deposit,
      ]);
    },

    async alterArgument(debateId, argumentId, text) {
      await write('alterArgument', [BigInt(debateId), argumentId, checked(text)]);
    },

    async moveArgument(debateId, argumentId, newParentArgumentId, initialApproval) {
      await write('moveArgument', [BigInt(debateId), argumentId, newParentArgumentId, initialApproval]);
    },

    async stake(debateId, argumentId, side, amount) {
      await write(side === 'pro' ? 'stakePro' : 'stakeCon', [BigInt(debateId), argumentId, amount]);
    },

    async redeemShares(debateId, argumentId) {
      await write('redeemArgumentShares', [BigInt(debateId), argumentId, account]);
    },

    async redeemSharesBatch(debateId, argumentIds) {
      await write('redeemArgumentSharesBatch', [BigInt(debateId), argumentIds, account]);
    },

    async claimFees(debateId, argumentId) {
      await write('claimFees', [BigInt(debateId), argumentId]);
    },

    async fundBounty(debateId, token, amount) {
      await approveIfNeeded(token, amount);
      await write('fundBounty', [BigInt(debateId), amount]);
    },

    async claimBounty(debateId, argumentIds) {
      await write('claimBounty', [BigInt(debateId), argumentIds]);
    },

    async sweepBounty(debateId) {
      await write('sweepBounty', [BigInt(debateId)]);
    },

    async tallyTree(debateId) {
      await write('tallyTree', [BigInt(debateId)]);
    },
  };
}

/** A short, human-readable message for a failed action. */
export function actionErrorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      // A Deliberate custom error decodes by name against the ABI - show it with its arguments
      // (e.g. "DurationTooShort(minimum: 300, actual: 250)") so the cause is legible. Error(string)
      // and Panic(uint256) decode to the reserved names "Error"/"Panic" and carry their text below.
      if (name && name !== 'Error' && name !== 'Panic') {
        const inputs = (revert.data?.abiItem as { inputs?: readonly { name?: string }[] } | undefined)?.inputs ?? [];
        const args = (revert.data?.args ?? []) as readonly unknown[];
        const body = args.length
          ? `${name}(${args.map((value, i) => `${inputs[i]?.name ?? `arg${i}`}: ${String(value)}`).join(', ')})`
          : name;
        return `The contract rejected this: ${body}`;
      }
      // A plain revert (a require string, or a bounty token's own "ERC20: ..." message bubbled up).
      if (revert.reason) {
        return `The contract rejected this: ${revert.reason}`;
      }
      // A selector in no ABI (a foreign contract's custom error): surface the raw bytes and its
      // 4-byte selector so it can be decoded off-app (e.g. openchain.xyz / 4byte.directory).
      if (revert.raw) {
        return `The contract reverted with unrecognized error data ${revert.raw} (selector ${revert.raw.slice(0, 10)}).`;
      }
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}
