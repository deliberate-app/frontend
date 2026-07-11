import { describe, expect, test } from 'bun:test';
import type { Abi, Address, EIP1193Provider, HDAccount } from 'viem';

import { rpcUp } from '../../scripts/devstack/anvil';
import { loadArtifact } from '../../scripts/devstack/artifacts';
import { anvilAccount, devChainClient } from '../../scripts/devstack/debate';
import { contentURIOf } from '../lib/ipfs';
import { connectDebateActions } from './actions';

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

    const poh = await deploy('MockProofOfHumanity.m.sol', 'MockProofOfHumanity', []);
    const address = await deploy('ArborVote.sol', 'ArborVote', [poh]);
    const { abi } = await loadArtifact(CONTRACTS_DIR, 'ArborVote.sol', 'ArborVote');

    // Debate creation stays outside the action layer - it is a deployment concern.
    const act = async (account: HDAccount, functionName: string, args: unknown[]) => {
      const { request } = await client.simulateContract({
        account,
        address,
        abi: abi as Abi,
        functionName,
        args,
      });
      const hash = await client.writeContract(request);
      await client.waitForTransactionReceipt({ hash });
    };
    const warp = async (seconds: number) => {
      await client.increaseTime({ seconds });
      await client.mine({ blocks: 1 });
    };

    const timeUnit = 60;
    await act(deployer, 'createDebate', [await contentURIOf('Test thesis'), timeUnit]);

    // The action layer, as the UI uses it: no IPFS API configured - digest-only publishing.
    const config = { address, rpcUrl: RPC_URL };
    const author = await connectDebateActions(config, anvilProvider, anvilAccount(7).address);
    const rater = await connectDebateActions(config, anvilProvider, anvilAccount(8).address);
    // The keeper never joins: the pokes (finalize/advance/tally) are permissionless.
    const keeper = await connectDebateActions(config, anvilProvider, anvilAccount(9).address);

    // Join.
    expect((await author.userState(0)).joined).toBe(false);
    await author.join(0);
    expect(await author.userState(0)).toEqual({ joined: true, tokens: 100 });

    // Author an argument at 80% initial approval (market reserves 2 pro / 8 con).
    await author.addArgument(0, 0, 'pro', 80, 'A machine-authored argument');
    expect((await author.userState(0)).tokens).toBe(90);

    // Too early for either poke: advancePhase silently no-ops on-chain, so the
    // action verifies the effect; finalizeArgument reverts, decoded by name.
    expect((await keeper.userState(0)).joined).toBe(false);
    await expect(keeper.advancePhase(0)).rejects.toThrow('The debate did not advance');
    await expect(keeper.finalizeArgument(0, 1)).rejects.toThrow('TimeOutOfBounds');

    // The keeper finalizes it and advances into the Rating phase.
    await warp(timeUnit + 1);
    await keeper.finalizeArgument(0, 1);
    await warp(7 * timeUnit);
    await keeper.advancePhase(0);

    // The rater disagrees: 20 tokens on con (fee 1, net 19) buy 8 + 19 - ceil(16/21) = 26 shares.
    await rater.join(0);
    await rater.stake(0, 1, 'con', 20);
    const raterPosition = await rater.position(0, 1);
    expect(raterPosition.conShares).toBe(26);
    expect(raterPosition.proShares).toBe(0);
    expect(raterPosition.claimableFees).toBe(0); // not the creator

    // The keeper finishes the debate.
    await warp(10 * timeUnit);
    await keeper.advancePhase(0);
    await keeper.tallyTree(0);

    // The correcting rater profits: 26 shares x 21/22 = 24 tokens back on 20 staked.
    await rater.redeemShares(0, 1);
    expect((await rater.userState(0)).tokens).toBe(104);

    // The author claims the accrued market fee.
    expect((await author.position(0, 1)).claimableFees).toBe(1);
    await author.claimFees(0, 1);
    expect((await author.userState(0)).tokens).toBe(91);
  }, 30_000);
});
