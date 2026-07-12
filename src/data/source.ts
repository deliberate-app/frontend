import { createPublicClient, getAddress, http, hexToBytes, hexToString, type Address, type Hex } from 'viem';
import abi from '../abi/ArborVote.abi.json';
import { fetchTextByDigest } from '../lib/ipfs';
import type { ArgumentNode, Debate, DebateSummary, Phase } from '../types';
import { thesisOf } from '../types';
import { climateDebate } from './climateDebate';
import { contractConfig } from './config';

export interface DebateSource {
  load(debateId: number): Promise<Debate>;
  list(): Promise<DebateSummary[]>;
}

export const mockSource: DebateSource = {
  load: async () => climateDebate,
  list: async () => [
    {
      id: climateDebate.id,
      thesis: thesisOf(climateDebate).text,
      phase: climateDebate.phase,
      stake: climateDebate.nodes.reduce((sum, node) => sum + node.weight, 0),
      argumentsCount: climateDebate.nodes.length,
    },
  ],
};

const PHASE_BY_STATUS: Record<number, Phase> = {
  1: 'editing',
  2: 'rating',
  3: 'tallying',
  4: 'finished',
};

const STATE_CREATED = 1;

interface OnChainArgument {
  contentURI: Hex;
  creator: Address;
  isSupporting: boolean;
  state: number;
  parentArgumentId: number;
  finalizationTime: bigint;
  pro: number;
  con: number;
  votes: number;
}

/**
 * Falls back for content that is not on IPFS: short ASCII payloads are decoded,
 * anything else is shown as the raw URI.
 */
function decodeInlineContent(contentURI: Hex): string {
  const text = hexToString(contentURI).replaceAll('\0', '');
  const printable = /^[\x20-\x7E]+$/.test(text);
  return printable && text.length > 0 ? text : `Argument content ${contentURI}`;
}

async function contentToText(contentURI: Hex, gateway: string | undefined): Promise<string> {
  if (gateway) {
    const ipfsText = await fetchTextByDigest(gateway, hexToBytes(contentURI));
    if (ipfsText !== null) return ipfsText;
  }
  return decodeInlineContent(contentURI);
}

/** Reads a debate from a deployed ArborVote contract. */
export function contractSource(address: Address, rpcUrl: string, ipfsGateway?: string): DebateSource {
  const client = createPublicClient({ transport: http(rpcUrl) });

  return {
    async load(debateId: number): Promise<Debate> {
      const id = BigInt(debateId);

      const [[currentPhase, editingEndTime, ratingEndTime], latestBlock] = await Promise.all([
        client.readContract({
          address,
          abi,
          functionName: 'phases',
          args: [id],
        }) as Promise<[number, bigint, bigint, bigint]>,
        client.getBlock(),
      ]);

      // A never-created debate reads back as all-zero: phase Uninitialized (0), no
      // root argument. Reject it here rather than fabricate a thesis-less debate the
      // view cannot render (e.g. a shared #/debate/N link to an id that does not exist).
      if (!PHASE_BY_STATUS[currentPhase]) {
        throw new Error(`Debate ${debateId} does not exist`);
      }

      // The next block's timestamp is at least the head's and at least the wall clock
      // (idle chains have stale heads; time-warped dev chains run ahead of the wall).
      const chainTime = Math.max(Number(latestBlock.timestamp), Math.floor(Date.now() / 1000));

      // Traverse the debate tree: every argument lies on a path from a leaf to the
      // thesis (id 0), so walking the parent links upward from all leaves visits the
      // whole tree. Arguments are fetched once each, one parallel wave per level.
      const leafArgumentIds = (await client.readContract({
        address,
        abi,
        functionName: 'getLeafArgumentIds',
        args: [id],
      })) as number[];

      const fetched = new Map<number, OnChainArgument>();
      let wave = [...new Set([0, ...leafArgumentIds])];
      while (wave.length > 0) {
        const results = (await Promise.all(
          wave.map((argumentId) =>
            client.readContract({
              address,
              abi,
              functionName: 'getArgument',
              args: [id, argumentId],
            }),
          ),
        )) as OnChainArgument[];
        wave.forEach((argumentId, i) => fetched.set(argumentId, results[i]));
        wave = [...new Set(results.map((argument) => argument.parentArgumentId))].filter(
          (parentId) => !fetched.has(parentId),
        );
      }

      const nodes: ArgumentNode[] = (
        await Promise.all(
          [...fetched.entries()]
            .sort(([a], [b]) => a - b)
            .map(async ([argumentId, argument]) => {
              const marketSize = argument.pro + argument.con;
              return {
                id: argumentId,
                parentId: argumentId === 0 ? null : argument.parentArgumentId,
                side:
                  argumentId === 0
                    ? null
                    : argument.isSupporting
                      ? ('pro' as const)
                      : ('con' as const),
                text: await contentToText(argument.contentURI, ipfsGateway),
                // Approval is the pro-share price of the argument's constant-product market:
                // the scarcer the pro reserve, the higher the approval.
                approval: marketSize === 0 ? 0.5 : argument.con / marketSize,
                weight: argument.votes,
                rawState: argument.state,
                state: argument.state === STATE_CREATED ? ('created' as const) : ('final' as const),
                finalizationTime: Number(argument.finalizationTime),
                creator: argument.creator,
              };
            }),
        )
      )
        .filter((node) => node.rawState !== 0)
        .map(({ rawState: _rawState, ...node }) => node);

      const phase = PHASE_BY_STATUS[currentPhase] ?? 'editing';
      const approved =
        phase === 'finished'
          ? ((await client.readContract({ address, abi, functionName: 'outcome', args: [id] })) as boolean)
          : undefined;

      return {
        id: debateId,
        phase,
        nodes,
        timing: {
          editingEndTime: Number(editingEndTime),
          ratingEndTime: Number(ratingEndTime),
          chainTime,
          loadedAt: Math.floor(Date.now() / 1000),
        },
        approved,
      };
    },

    async list(): Promise<DebateSummary[]> {
      const count = Number(
        await client.readContract({ address, abi, functionName: 'debatesCount', args: [] }),
      );
      return Promise.all(
        [...Array(count).keys()].map(async (debateId) => {
          const id = BigInt(debateId);
          const [thesis, [currentPhase], [totalVotes, argumentsCount]] = await Promise.all([
            client.readContract({
              address,
              abi,
              functionName: 'getArgument',
              args: [id, 0],
            }) as Promise<OnChainArgument>,
            client.readContract({
              address,
              abi,
              functionName: 'phases',
              args: [id],
            }) as Promise<[number, bigint, bigint, bigint]>,
            client.readContract({
              address,
              abi,
              functionName: 'debates',
              args: [id],
            }) as Promise<[number, number]>,
          ]);
          return {
            id: debateId,
            thesis: await contentToText(thesis.contentURI, ipfsGateway),
            phase: PHASE_BY_STATUS[currentPhase] ?? 'editing',
            stake: totalVotes,
            argumentsCount,
            creator: thesis.creator,
          };
        }),
      );
    },
  };
}

const PHASE_BY_NAME: Record<string, Phase> = {
  EDITING: 'editing',
  RATING: 'rating',
  TALLYING: 'tallying',
  FINISHED: 'finished',
};

/** Raw indexer rows; Hasura serializes the BigInt fields as strings. */
export interface IndexedDebateRow {
  phase: string;
  editingEndTime: string;
  ratingEndTime: string;
  approved: boolean | null;
}

export interface IndexedArgumentRow {
  argumentId: string;
  parent_id: string | null;
  isSupporting: boolean | null;
  contentURI: string;
  state: string;
  finalizationTime: string;
  pro: string;
  con: string;
  votes: string;
  creator: string;
}

/** Maps an indexer row to a debate node; the text still needs resolving from the contentURI. */
export function nodeFromIndex(row: IndexedArgumentRow): Omit<ArgumentNode, 'text'> & { contentURI: Hex } {
  const con = Number(row.con);
  const marketSize = Number(row.pro) + con;
  return {
    id: Number(row.argumentId),
    // Argument entity IDs are `{debateId}_{argumentId}`; the thesis has no parent.
    parentId: row.parent_id === null ? null : Number(row.parent_id.split('_')[1]),
    side: row.isSupporting === null ? null : row.isSupporting ? 'pro' : 'con',
    contentURI: row.contentURI as Hex,
    approval: marketSize === 0 ? 0.5 : con / marketSize,
    weight: Number(row.votes),
    state: row.state === 'CREATED' ? 'created' : 'final',
    finalizationTime: Number(row.finalizationTime),
    // The index stores addresses lowercased; checksum to match the chain reads.
    creator: getAddress(row.creator),
  };
}

/** A raw indexer debate row for the browse list. */
export interface IndexedDebateSummaryRow {
  id: string;
  creator: string;
  contentURI: string;
  phase: string;
  totalVotes: string;
  argumentsCount: string;
}

/** Maps an indexer row to a browse-list summary; the thesis text still needs resolving. */
export function summaryFromIndex(
  row: IndexedDebateSummaryRow,
): Omit<DebateSummary, 'thesis'> & { contentURI: Hex } {
  return {
    id: Number(row.id),
    contentURI: row.contentURI as Hex,
    phase: PHASE_BY_NAME[row.phase] ?? 'editing',
    stake: Number(row.totalVotes),
    argumentsCount: Number(row.argumentsCount),
    // The index stores addresses lowercased; checksum to match the chain reads.
    creator: getAddress(row.creator),
  };
}

const INDEXER_QUERY = `query DebateTree($debateId: String!) {
  Debate(where: { id: { _eq: $debateId } }) { phase editingEndTime ratingEndTime approved }
  Argument(where: { debate_id: { _eq: $debateId } }, order_by: { argumentId: asc }) {
    argumentId parent_id isSupporting contentURI state finalizationTime pro con votes creator
  }
}`;

const INDEXER_LIST_QUERY = `query DebateList {
  Debate { id creator contentURI phase totalVotes argumentsCount }
}`;

/**
 * Reads a debate from the indexer in one GraphQL query instead of RPC-traversing
 * the tree leaf by leaf. The chain clock still comes from the RPC head block -
 * the index carries no notion of "now".
 */
export function indexerSource(indexerUrl: string, rpcUrl: string, ipfsGateway?: string): DebateSource {
  const client = createPublicClient({ transport: http(rpcUrl) });

  const graphql = async <T>(query: string, variables?: Record<string, string>): Promise<T> => {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`The indexer responded with status ${response.status}`);
    }
    const { data, errors } = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (errors?.length || !data) {
      throw new Error(errors?.[0]?.message ?? 'The indexer returned no data');
    }
    return data;
  };

  return {
    async load(debateId: number): Promise<Debate> {
      const [data, latestBlock] = await Promise.all([
        graphql<{ Debate: IndexedDebateRow[]; Argument: IndexedArgumentRow[] }>(INDEXER_QUERY, {
          debateId: String(debateId),
        }),
        client.getBlock(),
      ]);
      const [debate] = data.Debate;
      if (!debate) {
        throw new Error(`Debate ${debateId} is not in the index (yet)`);
      }

      const nodes: ArgumentNode[] = await Promise.all(
        data.Argument.map(async (row) => {
          const { contentURI, ...node } = nodeFromIndex(row);
          return { ...node, text: await contentToText(contentURI, ipfsGateway) };
        }),
      );

      return {
        id: debateId,
        phase: PHASE_BY_NAME[debate.phase] ?? 'editing',
        nodes,
        timing: {
          editingEndTime: Number(debate.editingEndTime),
          ratingEndTime: Number(debate.ratingEndTime),
          // Same estimate as the contract source: at least the head, at least the wall.
          chainTime: Math.max(Number(latestBlock.timestamp), Math.floor(Date.now() / 1000)),
          loadedAt: Math.floor(Date.now() / 1000),
        },
        approved: debate.approved ?? undefined,
      };
    },

    async list(): Promise<DebateSummary[]> {
      const data = await graphql<{ Debate: IndexedDebateSummaryRow[] }>(INDEXER_LIST_QUERY);
      const summaries = await Promise.all(
        data.Debate.map(async (row) => {
          const { contentURI, ...summary } = summaryFromIndex(row);
          return { ...summary, thesis: await contentToText(contentURI, ipfsGateway) };
        }),
      );
      // Debate entity IDs are strings, so Hasura cannot order them numerically.
      return summaries.sort((a, b) => a.id - b.id);
    },
  };
}

/** Serves from the primary source, falling back (with a console note) when it fails. */
export function withFallback(primary: DebateSource, fallback: DebateSource): DebateSource {
  const guarded = <A extends unknown[], R>(call: (source: DebateSource) => (...args: A) => Promise<R>) => {
    return async (...args: A): Promise<R> => {
      try {
        return await call(primary)(...args);
      } catch (cause) {
        console.warn('Debate indexer unavailable - reading from the chain instead:', cause);
        return call(fallback)(...args);
      }
    };
  };
  return {
    load: guarded((source) => source.load.bind(source)),
    list: guarded((source) => source.list.bind(source)),
  };
}

/**
 * Picks the debate source: the indexer (with the chain as fallback) when configured,
 * plain chain reads otherwise, and the bundled sample debate without any deployment.
 */
export function defaultSource(): DebateSource {
  const config = contractConfig();
  if (!config) {
    return mockSource;
  }
  const chain = contractSource(config.address, config.rpcUrl, config.ipfsGateway);
  return config.indexerUrl
    ? withFallback(indexerSource(config.indexerUrl, config.rpcUrl, config.ipfsGateway), chain)
    : chain;
}
