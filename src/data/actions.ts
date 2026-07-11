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
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';

import abi from '../abi/ArborVote.abi.json';
import { contentURIOf, publishText } from '../lib/ipfs';
import type { Side } from '../types';
import type { ContractConfig } from './config';

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
  userState(debateId: number): Promise<UserState>;
  position(debateId: number, argumentId: number): Promise<ArgumentPosition>;
  join(debateId: number): Promise<void>;
  addArgument(
    debateId: number,
    parentArgumentId: number,
    side: Side,
    initialApproval: number,
    text: string,
  ): Promise<void>;
  invest(debateId: number, argumentId: number, side: Side, amount: number): Promise<void>;
  redeemShares(debateId: number, argumentId: number): Promise<void>;
  claimFees(debateId: number, argumentId: number): Promise<void>;
}

const PARTICIPANT_ROLE = 1;

export async function connectDebateActions(
  config: ContractConfig,
  provider: EIP1193Provider,
  account: Address,
): Promise<DebateActions> {
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const chain = defineChain({
    id: await publicClient.getChainId(),
    name: 'debate chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const walletClient = createWalletClient({ account, chain, transport: custom(provider) });

  const read = async <T>(functionName: string, args: unknown[]): Promise<T> =>
    (await publicClient.readContract({
      address: config.address,
      abi: abi as Abi,
      functionName,
      args,
    })) as T;

  const write = async (functionName: string, args: unknown[]): Promise<void> => {
    const { request } = await publicClient.simulateContract({
      account,
      address: config.address,
      abi: abi as Abi,
      functionName,
      args,
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
  };

  return {
    account,

    async userState(debateId) {
      const [role, tokens] = await Promise.all([
        read<number>('getUserRole', [BigInt(debateId), account]),
        read<number>('getUserTokens', [BigInt(debateId), account]),
      ]);
      return { joined: role === PARTICIPANT_ROLE, tokens };
    },

    async position(debateId, argumentId) {
      const [shares, argument] = await Promise.all([
        read<{ pro: number; con: number }>('getUserShares', [BigInt(debateId), argumentId, account]),
        read<{ creator: Address; fees: number }>('getArgument', [BigInt(debateId), argumentId]),
      ]);
      const isCreator = argument.creator.toLowerCase() === account.toLowerCase();
      return { proShares: shares.pro, conShares: shares.con, claimableFees: isCreator ? argument.fees : 0 };
    },

    join: (debateId) => write('join', [BigInt(debateId)]),

    async addArgument(debateId, parentArgumentId, side, initialApproval, text) {
      const contentURI: Hex = config.ipfsApi
        ? (await publishText(config.ipfsApi, text)).digest
        : await contentURIOf(text);
      await write('addArgument', [
        BigInt(debateId),
        parentArgumentId,
        contentURI,
        side === 'pro',
        initialApproval,
      ]);
    },

    invest: (debateId, argumentId, side, amount) =>
      write(side === 'pro' ? 'investInPro' : 'investInCon', [BigInt(debateId), argumentId, amount]),

    redeemShares: (debateId, argumentId) =>
      write('redeemArgumentShares', [BigInt(debateId), argumentId, account]),

    claimFees: (debateId, argumentId) => write('claimFees', [BigInt(debateId), argumentId]),
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
