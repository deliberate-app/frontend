import { describe, expect, test } from 'bun:test';
import type { Abi, Address, EIP1193Provider, Hex } from 'viem';

import { rpcUp } from '../../scripts/devstack/anvil';
import { loadArtifact } from '../../scripts/devstack/artifacts';
import { anvilAccount, devChainClient } from '../../scripts/devstack/debate';
import abi from '../abi/ArborVote.abi.json';
import { classicSchedule } from '../lib/debateTiming';
import { contentURIOf } from '../lib/ipfs';
import { connectDebateActions } from './actions';
import { contractSource } from './source';

const RPC_URL = 'http://127.0.0.1:8545';
const CONTRACTS_DIR = new URL('../../../contracts', import.meta.url).pathname;

const anvilAvailable = await rpcUp(RPC_URL);

/**
 * A minimal EIP-1193 provider forwarding every request to anvil, which signs
 * transactions for its unlocked dev accounts - the browser-wallet stand-in.
 */
const anvilProvider = {
  request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
    });
    const { result, error } = (await response.json()) as { result?: unknown; error?: { message: string } };
    if (error) {
      throw new Error(error.message);
    }
    return result;
  },
} as unknown as EIP1193Provider;

describe('debate actions (against a fresh deployment on the local anvil)', () => {
  test.skipIf(!anvilAvailable)('drive a debate end to end through the action layer', async () => {
    const client = devChainClient(RPC_URL);
    const deployer = anvilAccount(0);

    const deploy = async (sourceFile: string, name: string, args: unknown[]): Promise<Address> => {
      const artifact = await loadArtifact(CONTRACTS_DIR, sourceFile, name);
      const hash = await client.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args,
        account: deployer,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error('no contract address');
      return receipt.contractAddress;
    };

    const poh = await deploy('MockIdentityRegistry.m.sol', 'MockIdentityRegistry', []);
    const address = await deploy('ArborVote.sol', 'ArborVote', [poh]);

    const warp = async (seconds: number) => {
      await client.increaseTime({ seconds });
      await client.mine({ blocks: 1 });
    };

    // The action layer, as the UI uses it: no IPFS API configured - digest-only publishing.
    const config = { address, rpcUrl: RPC_URL };
    const author = await connectDebateActions(config, anvilProvider, anvilAccount(7).address);
    const rater = await connectDebateActions(config, anvilProvider, anvilAccount(8).address);
    // The keeper never joins: the tally is permissionless.
    const keeper = await connectDebateActions(config, anvilProvider, anvilAccount(9).address);
    // Reads come from the source layer (here the chain source; the app prefers the indexer).
    const reads = contractSource(address, RPC_URL);

    // The author starts the debate through the action layer and gets its ID back.
    const timeUnit = 60;
    expect(await author.createDebate('Test thesis', classicSchedule(timeUnit))).toBe(0);

    // Join.
    expect((await reads.userState(0, author.account)).joined).toBe(false);
    await author.join(0);
    expect(await reads.userState(0, author.account)).toEqual({ joined: true, tokens: 100, bountyClaimed: false });

    // Author an argument at 80% initial approval with the minimum 10-token deposit
    // (market reserves 2 pro / 8 con).
    await author.addArgument(0, 0, 'pro', 80, 10, 'A machine-authored argument');
    expect((await reads.userState(0, author.account)).tokens).toBe(90);

    // Time passes: the argument finalizes automatically once its window elapses, and the debate enters
    // Rating by the clock alone - no poke.
    await warp(timeUnit + 1);
    await warp(7 * timeUnit);

    // The rater disagrees: 20 tokens on con (fee 1, net 19) buy 8 + 19 - ceil(16/21) = 26 shares.
    await rater.join(0);
    await rater.stake(0, 1, 'con', 20);
    const raterPosition = await reads.argumentPosition(0, 1, rater.account);
    expect(raterPosition.conShares).toBe(26);
    expect(raterPosition.proShares).toBe(0);
    expect(raterPosition.claimableFees).toBe(0); // not the creator

    // The rating window closes by the clock; the keeper finishes the debate with the tally.
    await warp(10 * timeUnit);
    await keeper.tallyTree(0);

    // The correcting rater profits: 26 shares x 21/22 = 24 tokens back on 20 staked.
    await rater.redeemShares(0, 1);
    expect((await reads.userState(0, rater.account)).tokens).toBe(104);

    // The author claims the accrued market fee.
    expect((await reads.argumentPosition(0, 1, author.account)).claimableFees).toBe(1);
    await author.claimFees(0, 1);
    expect((await reads.userState(0, author.account)).tokens).toBe(91);
  }, 30_000);

  test.skipIf(!anvilAvailable)('edits and moves a draft argument through the action layer', async () => {
    const client = devChainClient(RPC_URL);
    const deployer = anvilAccount(0);
    const deploy = async (sourceFile: string, name: string, args: unknown[]): Promise<Address> => {
      const artifact = await loadArtifact(CONTRACTS_DIR, sourceFile, name);
      const hash = await client.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args,
        account: deployer,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error('no contract address');
      return receipt.contractAddress;
    };
    const poh = await deploy('MockIdentityRegistry.m.sol', 'MockIdentityRegistry', []);
    const address = await deploy('ArborVote.sol', 'ArborVote', [poh]);

    const config = { address, rpcUrl: RPC_URL };
    const author = await connectDebateActions(config, anvilProvider, anvilAccount(7).address);

    const timeUnit = 60;
    await author.createDebate('A movable thesis', classicSchedule(timeUnit));
    await author.join(0);

    // A draft directly under the thesis, edited while still inside its editing window.
    await author.addArgument(0, 0, 'pro', 60, 10, 'first draft'); // argument 1
    await author.alterArgument(0, 1, 'first draft, edited');
    const edited = (await client.readContract({
      address,
      abi: abi as Abi,
      functionName: 'getArgument',
      args: [0n, 1],
    })) as { contentURI: Hex };
    expect(edited.contentURI).toBe(await contentURIOf('first draft, edited'));

    // Argument 1's editing window elapses, so it finalizes automatically and becomes a valid move
    // target. A fresh draft (argument 2) is then added and moved beneath it, re-seeding its market
    // at 80% approval (reserves become 2 pro / 8 con).
    await client.increaseTime({ seconds: 2 * timeUnit });
    await client.mine({ blocks: 1 });
    await author.addArgument(0, 0, 'con', 60, 10, 'second draft'); // argument 2, a fresh draft
    await author.moveArgument(0, 2, 1, 80);

    const moved = (await contractSource(address, RPC_URL).load(0)).nodes.find((node) => node.id === 2);
    expect(moved?.parentId).toBe(1);
    // Approval is the pro-share price con/(pro+con) = 8/10.
    expect(moved?.approval).toBeCloseTo(0.8, 5);
  }, 30_000);

  test.skipIf(!anvilAvailable)('redeems shares across arguments in one batch', async () => {
    const client = devChainClient(RPC_URL);
    const deployer = anvilAccount(0);
    const deploy = async (sourceFile: string, name: string, args: unknown[]): Promise<Address> => {
      const artifact = await loadArtifact(CONTRACTS_DIR, sourceFile, name);
      const hash = await client.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args,
        account: deployer,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error('no contract address');
      return receipt.contractAddress;
    };
    const poh = await deploy('MockIdentityRegistry.m.sol', 'MockIdentityRegistry', []);
    const address = await deploy('ArborVote.sol', 'ArborVote', [poh]);

    const warp = async (seconds: number) => {
      await client.increaseTime({ seconds });
      await client.mine({ blocks: 1 });
    };

    const config = { address, rpcUrl: RPC_URL };
    const author = await connectDebateActions(config, anvilProvider, anvilAccount(7).address);
    const rater = await connectDebateActions(config, anvilProvider, anvilAccount(8).address);
    const keeper = await connectDebateActions(config, anvilProvider, anvilAccount(9).address);
    // Reads come from the source layer (here the indexer-less chain source).
    const reads = contractSource(address, RPC_URL);

    const timeUnit = 60;
    await author.createDebate('Batch redeem thesis', classicSchedule(timeUnit));
    await author.join(0);

    // Two arguments at 50% approval (reserves 5/5 each), the minimum deposit.
    await author.addArgument(0, 0, 'pro', 50, 10, 'first argument'); // id 1
    await author.addArgument(0, 0, 'pro', 50, 10, 'second argument'); // id 2

    // The arguments finalize automatically once their editing windows elapse, and the debate enters
    // Rating by the clock.
    await warp(timeUnit + 1);
    await warp(7 * timeUnit);

    // The rater takes a con position in both arguments (22 con shares, 20 tokens each).
    await rater.join(0);
    await rater.stake(0, 1, 'con', 20);
    await rater.stake(0, 2, 'con', 20);
    expect((await reads.userState(0, rater.account)).tokens).toBe(60);

    // The source reads the account's positions straight from the chain.
    const held = await reads.positions(0, anvilAccount(8).address);
    expect(held.map((position) => position.argumentId).sort()).toEqual([1, 2]);
    expect(held.every((position) => position.conShares > 0)).toBe(true);

    // Finish the debate (the rating window closes by the clock), then redeem both positions in one transaction.
    await warp(10 * timeUnit);
    await keeper.tallyTree(0);
    await rater.redeemSharesBatch(
      0,
      held.map((position) => position.argumentId),
    );

    // 20 tokens back per argument: 60 + 20 + 20 = 100.
    expect((await reads.userState(0, rater.account)).tokens).toBe(100);
    expect(await reads.positions(0, anvilAccount(8).address)).toEqual([]);
  }, 30_000);
});
