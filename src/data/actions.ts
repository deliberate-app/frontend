/**
 * The transaction layer: every state-changing debate interaction the app can perform,
 * bound to a connected wallet account. Each action simulates first (surfacing contract
 * errors before any signature prompt), sends, and waits for inclusion. Authoring goes
 * through the content pipeline: the text is published to IPFS first, then the returned
 * digest is committed on-chain - a failed transaction leaves only a pinned text block.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  parseEventLogs,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
  type TransactionReceipt,
} from 'viem';

import abi from '../abi/ArborVote.abi.json';
import type { DebateSchedule } from '../lib/debateTiming';
import { contentURIOf, publishText } from '../lib/ipfs';
import type { Side } from '../types';
import type { ContractConfig } from './config';
import { waitForIndexerBlock } from './source';

export interface UserState {
  joined: boolean;
  tokens: number;
}

export interface ArgumentPosition {
  proShares: number;
  conShares: number;
  /** Unclaimed market fees, when the account is the argument's creator. */
  claimableFees: number;
}

export interface DebateActions {
  account: Address;
  /** Creates a debate around a thesis with the given schedule and returns the new debate's ID. */
  createDebate(thesis: string, schedule: DebateSchedule): Promise<number>;
  join(debateId: number): Promise<void>;
  addArgument(
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
}

export async function connectDebateActions(
  config: ContractConfig,
  provider: EIP1193Provider,
  account: Address,
): Promise<DebateActions> {
  // Fast polling, low cache: viem serves block numbers from a per-client cache
  // (default 4 s), which would delay every receipt wait by a full cache window
  // once the cache is warm - sequential transactions crawl on instant-mining chains.
  const publicClient = createPublicClient({
    transport: http(config.rpcUrl),
    pollingInterval: 500,
    cacheTime: 500,
  });
  const chain = defineChain({
    id: await publicClient.getChainId(),
    name: 'debate chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const walletClient = createWalletClient({ account, chain, transport: custom(provider) });

  // Simulates (surfacing reverts before any signature), sends, and waits for the
  // receipt. Returns the receipt so callers can read the *mined* effects from the
  // events - the simulation's return value reflects pre-transaction state and can
  // be stale by the time the transaction lands.
  const write = async (
    functionName: string,
    args: unknown[],
    opts: { settle?: boolean } = {},
  ): Promise<TransactionReceipt> => {
    const { request } = await publicClient.simulateContract({
      account,
      address: config.address,
      abi: abi as Abi,
      functionName,
      args,
    });
    const hash = await walletClient.writeContract(request);
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

  /** Publishes authored text through the content pipeline, digest-only without an IPFS API. */
  const publish = async (text: string): Promise<Hex> =>
    config.ipfsApi ? (await publishText(config.ipfsApi, text)).digest : await contentURIOf(text);

  return {
    account,

    async createDebate(thesis, schedule) {
      const contentURI = await publish(thesis);
      const receipt = await write('createDebate', [
        contentURI,
        BigInt(schedule.lockingDuration),
        BigInt(schedule.editingDuration),
        BigInt(schedule.ratingDuration),
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

    async join(debateId) {
      // Join reflects optimistically in the UI, so it need not wait on the indexer.
      await write('join', [BigInt(debateId)], { settle: false });
    },

    async addArgument(debateId, parentArgumentId, side, initialApproval, deposit, text) {
      const contentURI = await publish(text);
      await write('addArgument', [
        BigInt(debateId),
        parentArgumentId,
        contentURI,
        side === 'pro',
        initialApproval,
        deposit,
      ]);
    },

    async alterArgument(debateId, argumentId, text) {
      const contentURI = await publish(text);
      await write('alterArgument', [BigInt(debateId), argumentId, contentURI]);
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

    async tallyTree(debateId) {
      await write('tallyTree', [BigInt(debateId)]);
    },
  };
}

/** A short, human-readable message for a failed action. */
export function actionErrorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      return `The contract rejected this: ${revert.data.errorName}`;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}
