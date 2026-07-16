import {
  createPublicClient,
  getAddress,
  http,
  hexToBytes,
  hexToString,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import abi from '../abi/Deliberate.abi.json';
import { fetchTextByDigest } from '../lib/ipfs';
import { tokenInfo } from '../lib/tokens';
import type { AccountPosition, ArgumentNode, Debate, DebateBounty, DebateSummary } from '../types';
import { CLAIM_WINDOW_SECONDS, phaseOf, shortDigest, thesisOf } from '../types';
import type { ArgumentPosition, UserState } from './actions';
import { climateDebate, confirmedDebate, editingDebate, objectedDebate } from './climateDebate';
import { contractConfig } from './config';

/** The `User.Role` enum value for a joined participant (Unassigned = 0, Participant = 1). */
const PARTICIPANT_ROLE = 1;

export interface DebateSource {
  load(debateId: number): Promise<Debate>;
  list(): Promise<DebateSummary[]>;
  /** The account's role and vote-token balance in a debate. */
  userState(debateId: number, account: string): Promise<UserState>;
  /** The account's shares in one argument, plus its claimable creator fees. */
  argumentPosition(debateId: number, argumentId: number, account: string): Promise<ArgumentPosition>;
  /** The account's share holdings across a debate's arguments, for the batch-redeem flow. */
  positions(debateId: number, account: string): Promise<AccountPosition[]>;
}

const sampleDebates = [climateDebate, confirmedDebate, objectedDebate, editingDebate];

export const mockSource: DebateSource = {
  load: async (debateId) => sampleDebates.find((debate) => debate.id === debateId) ?? climateDebate,
  list: async () =>
    sampleDebates.map((debate) => ({
      id: debate.id,
      thesis: thesisOf(debate).text,
      phase: debate.phase,
      approved: debate.approved,
      stake: debate.nodes.reduce((sum, node) => sum + node.weight, 0),
      argumentsCount: debate.nodes.length,
      bounty: debate.bounty,
    })),
  userState: async () => ({ joined: false, tokens: 0, bountyClaimed: false }),
  argumentPosition: async () => ({ proShares: 0, conShares: 0, claimableFees: 0 }),
  positions: async () => [],
};

// Phase.Status on-chain: 0 Uninitialized … 4 Finished. Only these two boundaries are read raw - one to
// reject a never-created debate, one to know the tally has run; the live phase between them is derived
// from the time gates via phaseOf, matching the contract.
const PHASE_UNINITIALIZED = 0;
const PHASE_FINISHED = 4;

interface OnChainArgument {
  contentURI: Hex;
  creator: Address;
  isSupporting: boolean;
  parentArgumentId: number;
  finalizationTime: bigint;
  pro: number;
  con: number;
  votes: number;
}

/** Resolved argument content: the text, plus the on-chain digest when it could not be resolved. */
export interface ResolvedContent {
  text: string;
  /** Set only when the content could not be resolved - the shortened digest is shown, copyable. */
  digest?: Hex;
}

/**
 * Falls back for content that is not on IPFS: short ASCII payloads are decoded inline (and count as
 * resolved), anything else surfaces the digest itself - shortened for display, the full value kept
 * so the UI can offer it for copying.
 */
export function decodeInlineContent(contentURI: Hex): ResolvedContent {
  const text = hexToString(contentURI).replaceAll('\0', '');
  const printable = /^[\x20-\x7E]+$/.test(text);
  return printable && text.length > 0
    ? { text }
    : { text: shortDigest(contentURI), digest: contentURI };
}

async function resolveContent(contentURI: Hex, gateway: string | undefined): Promise<ResolvedContent> {
  if (gateway) {
    const ipfsText = await fetchTextByDigest(gateway, hexToBytes(contentURI));
    if (ipfsText !== null) return { text: ipfsText };
  }
  return decodeInlineContent(contentURI);
}

/** Reads a debate's bounty from the chain; undefined when none is attached. */
async function readBounty(client: PublicClient, address: Address, id: bigint): Promise<DebateBounty | undefined> {
  const [token, pool, claimed, swept, claimEndTime] = (await client.readContract({
    address,
    abi,
    functionName: 'bounty',
    args: [id],
  })) as [Address, bigint, bigint, boolean, bigint];
  if (token === zeroAddress) {
    return undefined;
  }
  const info = await tokenInfo(token, client);
  return {
    token: info.address,
    symbol: info.symbol,
    decimals: info.decimals,
    pool,
    claimed,
    swept,
    claimEndTime: Number(claimEndTime),
  };
}

/** Reads a debate from a deployed Deliberate contract. */
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
      if (currentPhase === PHASE_UNINITIALIZED) {
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
              const content = await resolveContent(argument.contentURI, ipfsGateway);
              return {
                id: argumentId,
                parentId: argumentId === 0 ? null : argument.parentArgumentId,
                side:
                  argumentId === 0
                    ? null
                    : argument.isSupporting
                      ? ('pro' as const)
                      : ('con' as const),
                text: content.text,
                contentDigest: content.digest,
                // Approval is the pro-share price of the argument's constant-product market:
                // the scarcer the pro reserve, the higher the approval.
                approval: marketSize === 0 ? 0.5 : argument.con / marketSize,
                weight: argument.votes,
                // Final-ness is by time: an argument locks in automatically once its editing window elapses.
                state: chainTime >= Number(argument.finalizationTime) ? ('final' as const) : ('created' as const),
                finalizationTime: Number(argument.finalizationTime),
                creator: argument.creator,
              };
            }),
        )
      )
        // A nonexistent argument reads back with the zero-address creator; drop it. Defensive - the tree
        // traversal only visits real nodes, but existence is no longer a stored flag to key off.
        .filter((node) => node.creator !== zeroAddress);

      // Derive the live phase from the same clock the contract uses; only the terminal Finished latch is read raw.
      const finished = currentPhase === PHASE_FINISHED;
      const phase = phaseOf(Number(editingEndTime), Number(ratingEndTime), finished, chainTime);
      const [approved, bounty, [, , participantsCount]] = await Promise.all([
        finished
          ? (client.readContract({ address, abi, functionName: 'outcome', args: [id] }) as Promise<boolean>)
          : Promise.resolve(undefined),
        readBounty(client, address, id),
        client.readContract({ address, abi, functionName: 'debates', args: [id] }) as Promise<
          [number, number, number]
        >,
      ]);

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
        bounty,
        participantsCount: Number(participantsCount),
      };
    },

    async list(): Promise<DebateSummary[]> {
      const [count, latestBlock] = await Promise.all([
        client.readContract({ address, abi, functionName: 'debatesCount', args: [] }).then(Number),
        client.getBlock(),
      ]);
      // One clock for the whole list; each debate's phase is derived from its own gates, as the contract does.
      const chainTime = Math.max(Number(latestBlock.timestamp), Math.floor(Date.now() / 1000));
      return Promise.all(
        [...Array(count).keys()].map(async (debateId) => {
          const id = BigInt(debateId);
          const [thesis, [currentPhase, editingEndTime, ratingEndTime], [totalVotes, argumentsCount], bounty] =
            await Promise.all([
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
              }) as Promise<[number, number, number]>,
              readBounty(client, address, id),
            ]);
          const content = await resolveContent(thesis.contentURI, ipfsGateway);
          // The outcome exists only once the debate is finished (the read reverts before the tally).
          const approved = currentPhase === PHASE_FINISHED
            ? ((await client.readContract({ address, abi, functionName: 'outcome', args: [id] })) as boolean)
            : undefined;
          return {
            id: debateId,
            thesis: content.text,
            contentDigest: content.digest,
            phase: phaseOf(Number(editingEndTime), Number(ratingEndTime), currentPhase === PHASE_FINISHED, chainTime),
            approved,
            stake: totalVotes,
            argumentsCount,
            bounty,
            creator: thesis.creator,
          };
        }),
      );
    },

    async userState(debateId: number, account: string): Promise<UserState> {
      const id = BigInt(debateId);
      const [role, tokens, bountyClaimed] = (await client.readContract({
        address,
        abi,
        functionName: 'users',
        args: [id, account as Address],
      })) as [number, number, boolean];
      return { joined: role === PARTICIPANT_ROLE, tokens, bountyClaimed };
    },

    async argumentPosition(debateId: number, argumentId: number, account: string): Promise<ArgumentPosition> {
      const id = BigInt(debateId);
      const [shares, argument] = (await Promise.all([
        client.readContract({ address, abi, functionName: 'getUserShares', args: [id, argumentId, account as Address] }),
        client.readContract({ address, abi, functionName: 'getArgument', args: [id, argumentId] }),
      ])) as [{ pro: number; con: number }, { creator: Address; fees: number }];
      const isCreator = argument.creator.toLowerCase() === account.toLowerCase();
      return { proShares: shares.pro, conShares: shares.con, claimableFees: isCreator ? argument.fees : 0 };
    },

    async positions(debateId: number, account: string): Promise<AccountPosition[]> {
      const id = BigInt(debateId);
      const [, argumentsCount] = (await client.readContract({
        address,
        abi,
        functionName: 'debates',
        args: [id],
      })) as [number, number, number];

      // Argument ids are contiguous 1..argumentsCount-1 (id 0 is the market-less thesis).
      const ids = Array.from({ length: Math.max(0, Number(argumentsCount) - 1) }, (_, i) => i + 1);
      const shares = (await Promise.all(
        ids.map((argumentId) =>
          client.readContract({
            address,
            abi,
            functionName: 'getUserShares',
            args: [id, argumentId, account as Address],
          }),
        ),
      )) as { pro: number; con: number }[];

      return ids
        .map((argumentId, i) => ({
          argumentId,
          proShares: shares[i].pro,
          conShares: shares[i].con,
        }))
        .filter((position) => position.proShares > 0 || position.conShares > 0);
    },
  };
}

/** The bounty columns shared by the indexer's debate rows. */
export interface IndexedBountyColumns {
  bountyToken: string | null;
  bountyPool: string;
  bountyClaimed: string;
  bountySwept: boolean;
  finishedAt: string | null;
}

/** Raw indexer rows; Hasura serializes the BigInt fields as strings. */
export interface IndexedDebateRow extends IndexedBountyColumns {
  finished: boolean;
  editingEndTime: string;
  ratingEndTime: string;
  approved: boolean | null;
  participantsCount: string;
}

export interface IndexedArgumentRow {
  argumentId: string;
  parent_id: string | null;
  isSupporting: boolean | null;
  contentURI: string;
  finalizationTime: string;
  pro: string;
  con: string;
  votes: string;
  creator: string;
}

/**
 * Maps an indexer row to a debate node; the text still needs resolving from the contentURI.
 * Final-ness is derived from `chainTime` (the indexer stores no argument state) — an argument
 * locks in automatically once its editing window elapses.
 */
export function nodeFromIndex(
  row: IndexedArgumentRow,
  chainTime: number,
): Omit<ArgumentNode, 'text'> & { contentURI: Hex } {
  const con = Number(row.con);
  const marketSize = Number(row.pro) + con;
  const finalizationTime = Number(row.finalizationTime);
  return {
    id: Number(row.argumentId),
    // Argument entity IDs are `{debateId}_{argumentId}`; the thesis has no parent.
    parentId: row.parent_id === null ? null : Number(row.parent_id.split('_')[1]),
    side: row.isSupporting === null ? null : row.isSupporting ? 'pro' : 'con',
    contentURI: row.contentURI as Hex,
    approval: marketSize === 0 ? 0.5 : con / marketSize,
    weight: Number(row.votes),
    state: chainTime >= finalizationTime ? 'final' : 'created',
    finalizationTime,
    // The index stores addresses lowercased; checksum to match the chain reads.
    creator: getAddress(row.creator),
  };
}

/** A raw indexer debate row for the browse list. */
export interface IndexedDebateSummaryRow extends IndexedBountyColumns {
  id: string;
  creator: string;
  contentURI: string;
  finished: boolean;
  approved: boolean | null;
  editingEndTime: string;
  ratingEndTime: string;
  totalVotes: string;
  argumentsCount: string;
}

/** A raw indexer position row for the batch-redeem flow; `argument_id` is `{debateId}_{argumentId}`. */
export interface IndexedPositionRow {
  argument_id: string;
  proShares: string;
  conShares: string;
}

/** A bounty as the index stores it: the token by address only; its display identity resolves later. */
export interface RawBounty {
  token: string;
  pool: bigint;
  claimed: bigint;
  swept: boolean;
  claimEndTime: number;
}

/** The bounty columns of an indexer row as a raw bounty; undefined without a bounty token. */
export function rawBountyOf(row: IndexedBountyColumns): RawBounty | undefined {
  if (row.bountyToken === null) {
    return undefined;
  }
  return {
    token: getAddress(row.bountyToken),
    pool: BigInt(row.bountyPool),
    claimed: BigInt(row.bountyClaimed),
    swept: row.bountySwept,
    // The claim window is anchored at the tally; it mirrors the contract's CLAIM_WINDOW constant.
    claimEndTime: row.finishedAt === null ? 0 : Number(row.finishedAt) + CLAIM_WINDOW_SECONDS,
  };
}

/**
 * Maps an indexer row to a browse-list summary; the thesis text still needs resolving. The index stores no
 * phase - only the `finished` latch and the time gates - so the live phase is derived from `chainTime`.
 */
export function summaryFromIndex(
  row: IndexedDebateSummaryRow,
  chainTime: number,
): Omit<DebateSummary, 'thesis' | 'bounty'> & { contentURI: Hex; bountyRaw?: RawBounty } {
  return {
    id: Number(row.id),
    contentURI: row.contentURI as Hex,
    bountyRaw: rawBountyOf(row),
    phase: phaseOf(Number(row.editingEndTime), Number(row.ratingEndTime), row.finished, chainTime),
    // The outcome exists only once the tally has run (null in the index before that).
    approved: row.approved ?? undefined,
    stake: Number(row.totalVotes),
    argumentsCount: Number(row.argumentsCount),
    // The index stores addresses lowercased; checksum to match the chain reads.
    creator: getAddress(row.creator),
  };
}

const INDEXER_QUERY = `query DebateTree($debateId: String!) {
  Debate(where: { id: { _eq: $debateId } }) { finished editingEndTime ratingEndTime approved participantsCount finishedAt bountyToken bountyPool bountyClaimed bountySwept }
  Argument(where: { debate_id: { _eq: $debateId } }, order_by: { argumentId: asc }) {
    argumentId parent_id isSupporting contentURI finalizationTime pro con votes creator
  }
}`;

const INDEXER_LIST_QUERY = `query DebateList {
  Debate { id creator contentURI finished approved editingEndTime ratingEndTime totalVotes argumentsCount participantsCount finishedAt bountyToken bountyPool bountyClaimed bountySwept }
}`;

const INDEXER_POSITIONS_QUERY = `query AccountPositions($participantId: String!) {
  Position(where: { participant_id: { _eq: $participantId } }) { argument_id proShares conShares }
}`;

const INDEXER_USER_STATE_QUERY = `query UserState($participantId: String!) {
  Participant(where: { id: { _eq: $participantId } }) { tokens }
  BountyClaim(where: { id: { _eq: $participantId } }) { amount }
}`;

const INDEXER_ARGUMENT_POSITION_QUERY = `query ArgumentPosition($positionId: String!, $argumentId: String!) {
  Position(where: { id: { _eq: $positionId } }) { proShares conShares }
  Argument(where: { id: { _eq: $argumentId } }) { creator fees }
}`;

const CHAIN_METADATA_QUERY = `{ chain_metadata { latest_processed_block } }`;

/** The highest block the indexer has folded into its entities, or null if it is unreachable. */
async function latestProcessedBlock(indexerUrl: string): Promise<bigint | null> {
  try {
    const response = await fetch(indexerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: CHAIN_METADATA_QUERY }),
    });
    if (!response.ok) return null;
    const { data } = (await response.json()) as {
      data?: { chain_metadata?: Array<{ latest_processed_block: number | string }> };
    };
    const rows = data?.chain_metadata ?? [];
    // One chain per indexer deployment; take the max defensively.
    return rows.length === 0
      ? null
      : rows.reduce((max, row) => {
          const value = BigInt(row.latest_processed_block);
          return value > max ? value : max;
        }, 0n);
  } catch {
    return null;
  }
}

/**
 * Waits until the indexer has processed `blockNumber` - so a query issued afterwards reflects a
 * transaction mined in it - then resolves. Bails (returning false) on the timeout, or immediately
 * if the indexer is unreachable: the read layer's chain fallback is already fresh, so there is no
 * point blocking. Returns whether the indexer caught up.
 */
export async function waitForIndexerBlock(
  indexerUrl: string,
  blockNumber: bigint,
  { timeoutMs = 15_000, pollMs = 400 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const processed = await latestProcessedBlock(indexerUrl);
    if (processed === null) return false;
    if (processed >= blockNumber) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/**
 * Reads a debate from the indexer in one GraphQL query instead of RPC-traversing
 * the tree leaf by leaf. The chain clock still comes from the RPC head block -
 * the index carries no notion of "now".
 */
export function indexerSource(indexerUrl: string, rpcUrl: string, ipfsGateway?: string): DebateSource {
  const client = createPublicClient({ transport: http(rpcUrl) });

  /** Resolves a raw bounty's token identity (cached; one chain read per unknown token). */
  const enrichBounty = async (raw: RawBounty | undefined): Promise<DebateBounty | undefined> => {
    if (!raw) {
      return undefined;
    }
    const info = await tokenInfo(raw.token, client);
    return { ...raw, token: info.address, symbol: info.symbol, decimals: info.decimals };
  };

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

      // The chain clock derives every argument's final-ness (the index stores no state):
      // at least the head, at least the wall.
      const chainTime = Math.max(Number(latestBlock.timestamp), Math.floor(Date.now() / 1000));

      const nodes: ArgumentNode[] = await Promise.all(
        data.Argument.map(async (row) => {
          const { contentURI, ...node } = nodeFromIndex(row, chainTime);
          const content = await resolveContent(contentURI, ipfsGateway);
          return { ...node, text: content.text, contentDigest: content.digest };
        }),
      );

      return {
        id: debateId,
        phase: phaseOf(Number(debate.editingEndTime), Number(debate.ratingEndTime), debate.finished, chainTime),
        nodes,
        timing: {
          editingEndTime: Number(debate.editingEndTime),
          ratingEndTime: Number(debate.ratingEndTime),
          chainTime,
          loadedAt: Math.floor(Date.now() / 1000),
        },
        approved: debate.approved ?? undefined,
        bounty: await enrichBounty(rawBountyOf(debate)),
        participantsCount: Number(debate.participantsCount),
      };
    },

    async list(): Promise<DebateSummary[]> {
      // The index carries no notion of "now", so the phase is derived from one RPC-head clock for the whole list.
      const [data, latestBlock] = await Promise.all([
        graphql<{ Debate: IndexedDebateSummaryRow[] }>(INDEXER_LIST_QUERY),
        client.getBlock(),
      ]);
      const chainTime = Math.max(Number(latestBlock.timestamp), Math.floor(Date.now() / 1000));
      const summaries = await Promise.all(
        data.Debate.map(async (row) => {
          const { contentURI, bountyRaw, ...summary } = summaryFromIndex(row, chainTime);
          const [content, bounty] = await Promise.all([
            resolveContent(contentURI, ipfsGateway),
            enrichBounty(bountyRaw),
          ]);
          return { ...summary, thesis: content.text, contentDigest: content.digest, bounty };
        }),
      );
      // Debate entity IDs are strings, so Hasura cannot order them numerically.
      return summaries.sort((a, b) => a.id - b.id);
    },

    async userState(debateId: number, account: string): Promise<UserState> {
      const data = await graphql<{ Participant: Array<{ tokens: string }>; BountyClaim: Array<{ amount: string }> }>(
        INDEXER_USER_STATE_QUERY,
        { participantId: `${debateId}_${account.toLowerCase()}` },
      );
      // A Participant row exists only once the account has joined; a BountyClaim row once it claimed.
      const [participant] = data.Participant;
      const bountyClaimed = data.BountyClaim.length > 0;
      return participant
        ? { joined: true, tokens: Number(participant.tokens), bountyClaimed }
        : { joined: false, tokens: 0, bountyClaimed };
    },

    async argumentPosition(debateId: number, argumentId: number, account: string): Promise<ArgumentPosition> {
      const data = await graphql<{
        Position: Array<{ proShares: string; conShares: string }>;
        Argument: Array<{ creator: string; fees: string }>;
      }>(INDEXER_ARGUMENT_POSITION_QUERY, {
        positionId: `${debateId}_${argumentId}_${account.toLowerCase()}`,
        argumentId: `${debateId}_${argumentId}`,
      });
      const [position] = data.Position;
      const [argument] = data.Argument;
      const isCreator = argument !== undefined && argument.creator.toLowerCase() === account.toLowerCase();
      return {
        proShares: position ? Number(position.proShares) : 0,
        conShares: position ? Number(position.conShares) : 0,
        claimableFees: isCreator ? Number(argument.fees) : 0,
      };
    },

    async positions(debateId: number, account: string): Promise<AccountPosition[]> {
      // The indexer keys positions by participant (`{debateId}_{account}`, address lowercased),
      // exactly the account's share holdings across this debate's arguments.
      const data = await graphql<{ Position: IndexedPositionRow[] }>(INDEXER_POSITIONS_QUERY, {
        participantId: `${debateId}_${account.toLowerCase()}`,
      });
      return data.Position.map((row) => ({
        argumentId: Number(row.argument_id.split('_')[1]),
        proShares: Number(row.proShares),
        conShares: Number(row.conShares),
      })).filter((position) => position.proShares > 0 || position.conShares > 0);
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
    userState: guarded((source) => source.userState.bind(source)),
    argumentPosition: guarded((source) => source.argumentPosition.bind(source)),
    positions: guarded((source) => source.positions.bind(source)),
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
