import { describe, expect, test } from 'bun:test';
import { rpcUp } from '../../scripts/devstack/anvil';
import type { Debate, DebateSummary } from '../types';
import {
  contractSource,
  indexerSource,
  nodeFromIndex,
  summaryFromIndex,
  withFallback,
  type DebateSource,
} from './source';

describe('nodeFromIndex', () => {
  test('maps an argument row, deriving the approval from the reserves', () => {
    expect(
      nodeFromIndex({
        argumentId: '1',
        parent_id: '0_0',
        isSupporting: true,
        contentURI: '0xabc1',
        state: 'FINAL',
        finalizationTime: '90',
        pro: '21',
        con: '1',
        votes: '29',
        creator: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      }),
    ).toEqual({
      id: 1,
      parentId: 0,
      side: 'pro',
      contentURI: '0xabc1',
      approval: 1 / 22,
      weight: 29,
      state: 'final',
      finalizationTime: 90,
      // Checksummed from the index's lowercase form, matching chain reads.
      creator: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });
  });

  test('maps the thesis: no parent, no side, empty market reads as even', () => {
    const thesis = nodeFromIndex({
      argumentId: '0',
      parent_id: null,
      isSupporting: null,
      contentURI: '0xabc0',
      state: 'FINAL',
      finalizationTime: '0',
      pro: '0',
      con: '0',
      votes: '0',
      creator: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    });
    expect(thesis.parentId).toBeNull();
    expect(thesis.side).toBeNull();
    expect(thesis.approval).toBe(0.5);
  });
});

describe('summaryFromIndex', () => {
  test('maps a debate row to a browse summary', () => {
    expect(
      summaryFromIndex({
        id: '2',
        creator: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        contentURI: '0xabc2',
        phase: 'RATING',
        totalVotes: '291',
        argumentsCount: '25',
      }),
    ).toEqual({
      id: 2,
      contentURI: '0xabc2',
      phase: 'rating',
      stake: 291,
      argumentsCount: 25,
      creator: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });
  });
});

describe('withFallback', () => {
  const debate = { id: 0, phase: 'rating', nodes: [] } as unknown as Debate;
  const summaries = [{ id: 0 }] as unknown as DebateSummary[];
  const source = (result: Debate | Error): DebateSource => ({
    load: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    list: async () => {
      if (result instanceof Error) throw result;
      return summaries;
    },
  });

  test('serves from the primary while it works', async () => {
    expect(await withFallback(source(debate), source(new Error('unused'))).load(0)).toBe(debate);
    expect(await withFallback(source(debate), source(new Error('unused'))).list()).toBe(summaries);
  });

  test('falls back when the primary fails', async () => {
    expect(await withFallback(source(new Error('indexer down')), source(debate)).load(0)).toBe(debate);
    expect(await withFallback(source(new Error('indexer down')), source(debate)).list()).toBe(summaries);
  });
});

// The live equivalence check: the index must be a faithful mirror of the chain.
const RPC_URL = 'http://127.0.0.1:8545';
const INDEXER_URL = 'http://localhost:8090/v1/graphql';

// Read the deployment straight from .env.local - bun skips env files under NODE_ENV=test.
const envFile = Bun.file(new URL('../../.env.local', import.meta.url).pathname);
const address = (await envFile.exists())
  ? ((await envFile.text()).match(/^VITE_ARBORVOTE_ADDRESS=(0x[0-9a-fA-F]{40})$/m)?.[1] as
      | `0x${string}`
      | undefined)
  : undefined;

const indexerUp = await fetch(INDEXER_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{"query":"{ Debate { id } }"}',
})
  .then((response) => response.ok)
  .catch(() => false);
const stackUp = indexerUp && address !== undefined && (await rpcUp(RPC_URL));

describe('indexerSource (against the local dev stack)', () => {
  test.skipIf(!stackUp)('serves the same debate as the chain traversal', async () => {
    // No gateway on either side: texts decode identically without kubo in play.
    const fromIndex = await indexerSource(INDEXER_URL, RPC_URL).load(0);
    const fromChain = await contractSource(address!, RPC_URL).load(0);

    expect(fromIndex.phase).toBe(fromChain.phase);
    expect(fromIndex.timing!.editingEndTime).toBe(fromChain.timing!.editingEndTime);
    expect(fromIndex.timing!.ratingEndTime).toBe(fromChain.timing!.ratingEndTime);
    expect(fromIndex.nodes).toEqual(fromChain.nodes);
  }, 30_000);

  test.skipIf(!stackUp)('lists the same debates as the chain enumeration', async () => {
    const fromIndex = await indexerSource(INDEXER_URL, RPC_URL).list();
    const fromChain = await contractSource(address!, RPC_URL).list();
    expect(fromIndex.length).toBeGreaterThan(0);
    expect(fromIndex).toEqual(fromChain);
  }, 30_000);

  test.skipIf(!stackUp)('rejects a nonexistent debate id instead of fabricating one', async () => {
    const count = (await contractSource(address!, RPC_URL).list()).length;
    // An id past the counter has never been created: the read is all-zero.
    await expect(contractSource(address!, RPC_URL).load(count + 5)).rejects.toThrow('does not exist');
  }, 30_000);
});
