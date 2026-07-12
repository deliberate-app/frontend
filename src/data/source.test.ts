import { afterEach, describe, expect, test } from 'bun:test';
import { rpcUp } from '../../scripts/devstack/anvil';
import type { AccountPosition, Debate, DebateSummary } from '../types';
import {
  contractSource,
  indexerSource,
  nodeFromIndex,
  summaryFromIndex,
  waitForIndexerBlock,
  withFallback,
  type DebateSource,
} from './source';

describe('waitForIndexerBlock', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const stubProcessedBlock = (processed: number | null) => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: { chain_metadata: processed === null ? [] : [{ latest_processed_block: processed }] },
        }),
      )) as typeof fetch;
  };

  test('resolves true once the indexer has processed the block', async () => {
    stubProcessedBlock(100);
    expect(await waitForIndexerBlock('http://indexer', 100n)).toBe(true);
    expect(await waitForIndexerBlock('http://indexer', 99n)).toBe(true);
  });

  test('bails (false) when the indexer is unreachable, rather than blocking', async () => {
    globalThis.fetch = (async () => {
      throw new Error('indexer down');
    }) as typeof fetch;
    expect(await waitForIndexerBlock('http://indexer', 100n, { timeoutMs: 5000, pollMs: 10 })).toBe(false);
  });

  test('bails (false) on timeout while the indexer stays behind', async () => {
    stubProcessedBlock(50);
    expect(await waitForIndexerBlock('http://indexer', 100n, { timeoutMs: 60, pollMs: 20 })).toBe(false);
  });
});

describe('nodeFromIndex', () => {
  const row = {
    argumentId: '1',
    parent_id: '0_0',
    isSupporting: true,
    contentURI: '0xabc1',
    finalizationTime: '90',
    pro: '21',
    con: '1',
    votes: '29',
    creator: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  };

  test('maps an argument row, deriving the approval from the reserves and finality from the clock', () => {
    expect(nodeFromIndex(row, 100)).toEqual({
      id: 1,
      parentId: 0,
      side: 'pro',
      contentURI: '0xabc1',
      approval: 1 / 22,
      weight: 29,
      state: 'final', // chain time 100 is past the finalization time 90
      finalizationTime: 90,
      // Checksummed from the index's lowercase form, matching chain reads.
      creator: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    });
  });

  test('reads a draft while the chain clock is before its finalization time', () => {
    expect(nodeFromIndex(row, 89).state).toBe('created');
  });

  test('maps the thesis: no parent, no side, empty market reads as even', () => {
    const thesis = nodeFromIndex(
      {
        argumentId: '0',
        parent_id: null,
        isSupporting: null,
        contentURI: '0xabc0',
        finalizationTime: '0',
        pro: '0',
        con: '0',
        votes: '0',
        creator: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      },
      100,
    );
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
  const positions: AccountPosition[] = [{ argumentId: 1, proShares: 3, conShares: 0 }];
  const userState = { joined: true, tokens: 90 };
  const source = (result: Debate | Error): DebateSource => ({
    load: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    list: async () => {
      if (result instanceof Error) throw result;
      return summaries;
    },
    userState: async () => {
      if (result instanceof Error) throw result;
      return userState;
    },
    argumentPosition: async () => {
      if (result instanceof Error) throw result;
      return { proShares: 0, conShares: 0, claimableFees: 0 };
    },
    positions: async () => {
      if (result instanceof Error) throw result;
      return positions;
    },
  });

  test('serves from the primary while it works', async () => {
    expect(await withFallback(source(debate), source(new Error('unused'))).load(0)).toBe(debate);
    expect(await withFallback(source(debate), source(new Error('unused'))).list()).toBe(summaries);
    expect(await withFallback(source(debate), source(new Error('unused'))).positions(0, '0xabc')).toBe(
      positions,
    );
    expect(await withFallback(source(debate), source(new Error('unused'))).userState(0, '0xabc')).toBe(
      userState,
    );
  });

  test('falls back when the primary fails', async () => {
    expect(await withFallback(source(new Error('indexer down')), source(debate)).load(0)).toBe(debate);
    expect(await withFallback(source(new Error('indexer down')), source(debate)).list()).toBe(summaries);
    expect(
      await withFallback(source(new Error('indexer down')), source(debate)).positions(0, '0xabc'),
    ).toBe(positions);
    expect(
      await withFallback(source(new Error('indexer down')), source(debate)).userState(0, '0xabc'),
    ).toBe(userState);
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
