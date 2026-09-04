import {
  createPublicClient,
  getAbiItem,
  getAddress,
  http,
  zeroAddress,
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import abi from '../abi/Deliberate.abi.json';
import { tokenInfo } from '../lib/tokens';
import type { StakeEvent } from '../lib/history';
import type { AccountPosition, ArgumentMarket, ArgumentNode, Debate, DebateBounty, DebateSummary } from '../types';
import { CLAIM_WINDOW_SECONDS, phaseOf, thesisOf } from '../types';
import type { ArgumentPosition, UserState } from './actions';
import { climateDebate, confirmedDebate, editingDebate, objectedDebate } from './climateDebate';
import type { ContractConfig } from './config';

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
  /**
   * The market fees an argument has earned its author over its lifetime, in vote tokens - what
   * every stake on it paid, whether or not the author has claimed it yet.
   */
  feesEarned(debateId: number, argumentId: number): Promise<number>;
  /**
   * Every argument's market as it stands - the one read cheap enough to repeat every few seconds
   * while someone decides on a stake: no texts to resolve, no bounty or clock, just the columns a
   * stake can move.
   */
  markets(debateId: number): Promise<ArgumentMarket[]>;
  /**
   * Every stake the debate has seen, oldest first - what the argument detail's chart replays.
   * Empty from a source that keeps no history: only the index dates its rows, and a chain read
   * would need a block fetch per stake to date them, which is not worth a chart.
   */
  history(debateId: number): Promise<StakeEvent[]>;
  /**
   * Every account that joined the debate with the vote tokens it holds, most first. Empty from a
   * source that keeps no participant list: the chain stores balances per account, not per debate.
   */
  participants(debateId: number): Promise<DebateParticipant[]>;
  /**
   * The registries a creator can name for a debate: every Circles registry the factory made, and the
   * allowlists the account owns. Empty from a source that keeps no list: only the index knows what
   * the factory has cloned.
   */
  registries(account?: string): Promise<IdentityRegistryInfo[]>;
}

/** An identity registry the factory made, as the index records it. */
export interface IdentityRegistryInfo {
  address: Address;
  kind: 'allowlist' | 'circles';
  /** The account that keeps the list. Allowlists only. */
  owner?: Address;
  /** The Circles avatar whose trust admits an account. Circles registries only; the zero address admits every registered human. */
  anchor?: Address;
  /** Whether an admitted account must also be a registered Circles human. Circles registries only. */
  requireHuman?: boolean;
}

/** One account's standing in a debate, in the contract's units. */
export interface DebateParticipant {
  account: string;
  /** Vote tokens held: the joining grant, less what is staked, plus what has been redeemed. */
  tokens: number;
}

/** The market columns of a node, as a market refetch would report them. */
export function marketOf(node: ArgumentNode): ArgumentMarket {
  const { id, approval, proReserve, conReserve, weight, rating } = node;
  return { id, approval, proReserve, conReserve, weight, rating };
}

const sampleDebates = [climateDebate, confirmedDebate, objectedDebate, editingDebate];

export const mockSource: DebateSource = {
  load: async (debateId) => sampleDebates.find((debate) => debate.id === debateId) ?? climateDebate,
  // The sample knows no factory, so there is nothing to pick from.
  registries: async () => [],
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
  feesEarned: async () => 0,
  markets: async (debateId) => (await mockSource.load(debateId)).nodes.map(marketOf),
  history: async () => [],
  participants: async () => [],
};

// Phase.Status on-chain: 0 Uninitialized … 4 Finished. Only these two boundaries are read raw - one to
// reject a never-created debate, one to know the tally has run; the live phase between them is derived
// from the time gates via phaseOf, matching the contract.
const PHASE_UNINITIALIZED = 0;
const PHASE_FINISHED = 4;

interface OnChainArgument {
  creator: Address;
  isSupporting: boolean;
  parentArgumentId: number;
  finalizationTime: bigint;
  pro: number;
  con: number;
  stake: number;
  rating: bigint;
}

/** The contract's fixed-point scale: a rating of ±MAX_APPROVAL is full conviction (±100%). */
const MAX_APPROVAL = 4294967295;

/** The ABI's definition of an event, resolved once - the log reads below filter on these. */
const eventNamed = (name: string): AbiEvent => {
  const item = getAbiItem({ abi: abi as Abi, name });
  if (item?.type !== 'event') {
    throw new Error(`the ABI has no ${name} event - run \`just sync-abi\``);
  }
  return item;
};

/** The events a text travels in: the thesis with its debate, an argument with its creation, and every edit. */
const CONTENT_EVENTS = ['DebateCreated', 'ArgumentCreated', 'ArgumentAltered'].map(eventNamed);
const DEBATE_CREATED = eventNamed('DebateCreated');

/** The text an event published, and the argument it belongs to; the thesis is argument 0. */
function publishedText(log: { eventName?: string; args: unknown }): { id: number; text: string } {
  const { argumentId, content } = log.args as { argumentId?: number; content: string };
  return { id: log.eventName === 'DebateCreated' ? 0 : Number(argumentId), text: content };
}

/**
 * The texts of a debate's arguments by id, read from the log - the one place the chain keeps them.
 * An `ArgumentAltered` replaces the text it names, and the log arrives in chain order, so the last
 * word wins by being applied last. All three events go in one request: only their signatures are
 * filtered on the node, and this debate's are picked out here.
 */
async function readTexts(client: PublicClient, address: Address, debateId: bigint): Promise<Map<number, string>> {
  const logs = await client.getLogs({ address, events: CONTENT_EVENTS, fromBlock: 0n, strict: true });
  const texts = new Map<number, string>();
  for (const log of logs) {
    if ((log.args as { debateId: bigint }).debateId === debateId) {
      const { id, text } = publishedText(log);
      texts.set(id, text);
    }
  }
  return texts;
}

/** Every debate's thesis by id, from the `DebateCreated` log - one request for the whole list. */
async function readTheses(client: PublicClient, address: Address): Promise<Map<number, string>> {
  const logs = await client.getLogs({ address, event: DEBATE_CREATED, fromBlock: 0n, strict: true });
  return new Map(
    logs.map((log) => {
      const { debateId, content } = log.args as { debateId: bigint; content: string };
      return [Number(debateId), content];
    }),
  );
}

/**
 * The text the log published for something the state carries. Missing means the two came from
 * nodes at different heights: an empty card would say the argument has nothing to say, so the
 * read fails instead and the caller retries.
 */
function textOf(texts: Map<number, string>, id: number, what: string): string {
  const text = texts.get(id);
  if (text === undefined) {
    throw new Error(`${what} ${id} has no text in the log yet`);
  }
  return text;
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

/**
 * Reads a debate from a deployed Deliberate contract, taking the argument texts from its log.
 *
 * The scan runs from the first block, and there is deliberately no configured start: an RPC
 * indexes logs by address, so asking it for one contract's whole history costs the same as asking
 * for the part since its deployment (measured on Gnosis: 0.26 s either way). A start block would
 * be a third per-network fact to keep in step with the address, buying nothing - and it would not
 * bound the range either, since the range grows with the chain whatever it starts at.
 */
export function contractSource(address: Address, rpcUrl: string): DebateSource {
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

      // Read after the state, so the scan reaches every argument the state already has: a text
      // missing from a log scan that ended earlier would be one this debate does have.
      const texts = await readTexts(client, address, id);

      const nodes: ArgumentNode[] = [...fetched.entries()]
        .sort(([a], [b]) => a - b)
        .map(([argumentId, argument]) => {
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
            text: textOf(texts, argumentId, 'argument'),
            // Approval is the pro-share price of the argument's constant-product market:
            // the scarcer the pro reserve, the higher the approval.
            approval: marketSize === 0 ? 0.5 : argument.con / marketSize,
            proReserve: argument.pro,
            conReserve: argument.con,
            weight: argument.stake,
            // The stored settlement rating exists once the tally has run; before that the
            // field reads zero, which is a legal rating, so the phase decides null.
            rating:
              currentPhase === PHASE_FINISHED && argumentId !== 0
                ? Number(argument.rating) / MAX_APPROVAL
                : null,
            // Final-ness is by time: an argument locks in automatically once its editing window elapses.
            state: chainTime >= Number(argument.finalizationTime) ? ('final' as const) : ('created' as const),
            finalizationTime: Number(argument.finalizationTime),
            creator: argument.creator,
          };
        })
        // A nonexistent argument reads back with the zero-address creator; drop it. Defensive - the tree
        // traversal only visits real nodes, but existence is no longer a stored flag to key off.
        .filter((node) => node.creator !== zeroAddress);

      // Derive the live phase from the same clock the contract uses; only the terminal Finished latch is read raw.
      const finished = currentPhase === PHASE_FINISHED;
      const phase = phaseOf(Number(editingEndTime), Number(ratingEndTime), finished, chainTime);
      const [approved, bounty, [, , participantsCount, feePercentage, identityRegistry]] = await Promise.all([
        finished
          ? (client.readContract({ address, abi, functionName: 'outcome', args: [id] }) as Promise<boolean>)
          : Promise.resolve(undefined),
        readBounty(client, address, id),
        client.readContract({ address, abi, functionName: 'debates', args: [id] }) as Promise<
          [number, number, number, number, Hex]
        >,
      ]);

      return {
        id: debateId,
        phase,
        feePercentage: Number(feePercentage),
        identityRegistry,
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
      const [count, latestBlock, theses] = await Promise.all([
        client.readContract({ address, abi, functionName: 'debatesCount', args: [] }).then(Number),
        client.getBlock(),
        readTheses(client, address),
      ]);
      // One clock for the whole list; each debate's phase is derived from its own gates, as the contract does.
      const chainTime = Math.max(Number(latestBlock.timestamp), Math.floor(Date.now() / 1000));
      return Promise.all(
        [...Array(count).keys()].map(async (debateId) => {
          const id = BigInt(debateId);
          const [thesis, [currentPhase, editingEndTime, ratingEndTime], [totalStake, argumentsCount], bounty] =
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
              }) as Promise<[number, number, number, number, Hex]>,
              readBounty(client, address, id),
            ]);
          // The outcome exists only once the debate is finished (the read reverts before the tally).
          const approved = currentPhase === PHASE_FINISHED
            ? ((await client.readContract({ address, abi, functionName: 'outcome', args: [id] })) as boolean)
            : undefined;
          return {
            id: debateId,
            thesis: textOf(theses, debateId, 'debate'),
            phase: phaseOf(Number(editingEndTime), Number(ratingEndTime), currentPhase === PHASE_FINISHED, chainTime),
            approved,
            stake: totalStake,
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
      })) as [number, number, number, number, Hex];

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

    async feesEarned(debateId: number, argumentId: number): Promise<number> {
      // The chain keeps only the standing balance, which the author's claim zeroes: exact until the
      // debate finishes (fees claim only then), a floor afterwards. The lifetime figure needs the
      // stake history, which is the index's to keep.
      const argument = (await client.readContract({
        address,
        abi,
        functionName: 'getArgument',
        args: [BigInt(debateId), argumentId],
      })) as { fees: number };
      return argument.fees;
    },

    async markets(debateId: number): Promise<ArgumentMarket[]> {
      const id = BigInt(debateId);
      const [[currentPhase], [, argumentsCount]] = await Promise.all([
        client.readContract({ address, abi, functionName: 'phases', args: [id] }) as Promise<[number, bigint, bigint, bigint]>,
        client.readContract({ address, abi, functionName: 'debates', args: [id] }) as Promise<[number, number, number, number]>,
      ]);
      // Argument ids are contiguous 0..argumentsCount-1; the thesis (0) has no market of its own,
      // its columns read as the empty market load() gives it.
      const ids = Array.from({ length: Number(argumentsCount) }, (_, i) => i);
      const rows = (await Promise.all(
        ids.map((argumentId) => client.readContract({ address, abi, functionName: 'getArgument', args: [id, argumentId] })),
      )) as OnChainArgument[];
      return rows.map((argument, i) => {
        const marketSize = argument.pro + argument.con;
        return {
          id: ids[i],
          approval: marketSize === 0 ? 0.5 : argument.con / marketSize,
          proReserve: argument.pro,
          conReserve: argument.con,
          weight: argument.stake,
          rating: currentPhase === PHASE_FINISHED && ids[i] !== 0 ? Number(argument.rating) / MAX_APPROVAL : null,
        };
      });
    },

    // Dating a stake from the chain costs a block read per stake; the index dated them already.
    async history(): Promise<StakeEvent[]> {
      return [];
    },

    // Who joined is only known from the Joined events, which the index has folded already.
    async participants(): Promise<DebateParticipant[]> {
      return [];
    },

    // What the factory cloned is only known from its events, which the index has folded already.
    async registries(): Promise<IdentityRegistryInfo[]> {
      return [];
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

/**
 * An entity's key in the index, which opens with the chain it happened on: debate ids restart at
 * zero on every chain, and one indexer serves them all. Mirrors the indexer's own id helpers.
 */
const debateKey = (chainId: number, debateId: number) => `${chainId}_${debateId}`;
const argumentKey = (chainId: number, debateId: number, argumentId: number) =>
  `${debateKey(chainId, debateId)}_${argumentId}`;
const participantKey = (chainId: number, debateId: number, account: string) =>
  `${debateKey(chainId, debateId)}_${account.toLowerCase()}`;

/** The trailing argument id of an `{chainId}_{debateId}_{argumentId}` key. */
const argumentIdIn = (key: string) => Number(key.split('_')[2]);

/** Raw indexer rows; Hasura serializes the BigInt fields as strings. */
export interface IndexedDebateRow extends IndexedBountyColumns {
  finished: boolean;
  editingEndTime: string;
  ratingEndTime: string;
  approved: boolean | null;
  participantsCount: string;
  feePercentage: string;
  identityRegistry: string;
}

export interface IndexedArgumentRow {
  argumentId: string;
  parent_id: string | null;
  isSupporting: boolean | null;
  content: string;
  finalizationTime: string;
  pro: string;
  con: string;
  stake: string;
  creator: string;
  rating: string | null;
}

/** The market columns of an indexer argument row. */
export type IndexedMarketRow = Pick<IndexedArgumentRow, 'argumentId' | 'pro' | 'con' | 'stake' | 'rating'>;

/** Maps an indexer row's market columns the way `nodeFromIndex` maps them - one reading, two callers. */
export function marketFromIndex(row: IndexedMarketRow): ArgumentMarket {
  const con = Number(row.con);
  const marketSize = Number(row.pro) + con;
  return {
    id: Number(row.argumentId),
    approval: marketSize === 0 ? 0.5 : con / marketSize,
    proReserve: Number(row.pro),
    conReserve: con,
    weight: Number(row.stake),
    // The index writes the rating when the tally emits it; null until then.
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating) / MAX_APPROVAL,
  };
}

/**
 * Maps an indexer row to a debate node. Final-ness is derived from `chainTime` (the indexer stores
 * no argument state) — an argument locks in automatically once its editing window elapses.
 */
export function nodeFromIndex(row: IndexedArgumentRow, chainTime: number): ArgumentNode {
  const finalizationTime = Number(row.finalizationTime);
  return {
    ...marketFromIndex(row),
    parentId: row.parent_id === null ? null : argumentIdIn(row.parent_id),
    side: row.isSupporting === null ? null : row.isSupporting ? 'pro' : 'con',
    text: row.content,
    state: chainTime >= finalizationTime ? 'final' : 'created',
    finalizationTime,
    // The index stores addresses lowercased; checksum to match the chain reads.
    creator: getAddress(row.creator),
  };
}

/** A raw indexer debate row for the browse list. */
export interface IndexedDebateSummaryRow extends IndexedBountyColumns {
  debateId: string;
  creator: string;
  content: string;
  finished: boolean;
  approved: boolean | null;
  editingEndTime: string;
  ratingEndTime: string;
  totalStake: string;
  argumentsCount: string;
}

/** A raw indexer stake row; `argument_id` is an argument key. */
export interface IndexedStakeRow {
  argument_id: string;
  isPro: boolean;
  voteTokensStaked: string;
  fee: string;
  sharesOut: string;
  timestamp: string;
}

/** A raw indexer position row for the batch-redeem flow; `argument_id` is an argument key. */
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
 * Maps an indexer row to a browse-list summary. The index stores no phase - only the `finished`
 * latch and the time gates - so the live phase is derived from `chainTime`.
 */
export function summaryFromIndex(
  row: IndexedDebateSummaryRow,
  chainTime: number,
): Omit<DebateSummary, 'bounty'> & { bountyRaw?: RawBounty } {
  return {
    id: Number(row.debateId),
    thesis: row.content,
    bountyRaw: rawBountyOf(row),
    phase: phaseOf(Number(row.editingEndTime), Number(row.ratingEndTime), row.finished, chainTime),
    // The outcome exists only once the tally has run (null in the index before that).
    approved: row.approved ?? undefined,
    stake: Number(row.totalStake),
    argumentsCount: Number(row.argumentsCount),
    // The index stores addresses lowercased; checksum to match the chain reads.
    creator: getAddress(row.creator),
  };
}

const INDEXER_QUERY = `query DebateTree($debateId: String!) {
  Debate(where: { id: { _eq: $debateId } }) { finished editingEndTime ratingEndTime approved participantsCount feePercentage identityRegistry finishedAt bountyToken bountyPool bountyClaimed bountySwept }
  Argument(where: { debate_id: { _eq: $debateId } }, order_by: { argumentId: asc }) {
    argumentId parent_id isSupporting content finalizationTime pro con stake creator rating
  }
}`;

const INDEXER_LIST_QUERY = `query DebateList($chainId: Int!) {
  Debate(where: { chainId: { _eq: $chainId } }) { debateId creator content finished approved editingEndTime ratingEndTime totalStake argumentsCount participantsCount finishedAt bountyToken bountyPool bountyClaimed bountySwept }
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

const INDEXER_MARKETS_QUERY = `query DebateMarkets($debateId: String!) {
  Argument(where: { debate_id: { _eq: $debateId } }) { argumentId pro con stake rating }
}`;

const INDEXER_HISTORY_QUERY = `query DebateStakes($argumentPrefix: String!) {
  Stake(where: { argument_id: { _like: $argumentPrefix } }, order_by: { timestamp: asc }) {
    argument_id isPro voteTokensStaked fee sharesOut timestamp
  }
}`;

const INDEXER_PARTICIPANTS_QUERY = `query DebateParticipants($debateId: String!) {
  Participant(where: { debate_id: { _eq: $debateId } }, order_by: { tokens: desc }) { account tokens }
}`;

// Every Circles registry, and the allowlists one account owns. The enum is written into the query,
// as Hasura takes it unquoted; the owner is lowercased to match how the index stores addresses.
const INDEXER_REGISTRIES_QUERY = `query Registries($chainId: Int!, $owner: String!) {
  IdentityRegistry(
    where: { chainId: { _eq: $chainId }, _or: [{ kind: { _eq: CIRCLES } }, { owner: { _eq: $owner } }] }
    order_by: { createdAt: desc }
  ) { address kind owner anchor requireHuman }
}`;

const INDEXER_ARGUMENT_FEES_QUERY = `query ArgumentFees($argumentId: String!) {
  Argument(where: { id: { _eq: $argumentId } }) { feesEarned }
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
export function indexerSource(indexerUrl: string, rpcUrl: string): DebateSource {
  const client = createPublicClient({ transport: http(rpcUrl) });

  /**
   * The chain this deployment reads, asked of its own RPC once.
   *
   * One indexer holds every chain, so every query has to name one - and taking it from the same
   * endpoint the app transacts against is what stops the two from ever disagreeing.
   */
  let chainIdOnce: Promise<number> | null = null;
  const chainId = (): Promise<number> => (chainIdOnce ??= client.getChainId());

  /** Resolves a raw bounty's token identity (cached; one chain read per unknown token). */
  const enrichBounty = async (raw: RawBounty | undefined): Promise<DebateBounty | undefined> => {
    if (!raw) {
      return undefined;
    }
    const info = await tokenInfo(raw.token, client);
    return { ...raw, token: info.address, symbol: info.symbol, decimals: info.decimals };
  };

  const graphql = async <T>(query: string, variables?: Record<string, string | number>): Promise<T> => {
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
      const chain = await chainId();
      const [data, latestBlock] = await Promise.all([
        graphql<{ Debate: IndexedDebateRow[]; Argument: IndexedArgumentRow[] }>(INDEXER_QUERY, {
          debateId: debateKey(chain, debateId),
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

      const nodes = data.Argument.map((row) => nodeFromIndex(row, chainTime));

      return {
        id: debateId,
        phase: phaseOf(Number(debate.editingEndTime), Number(debate.ratingEndTime), debate.finished, chainTime),
        feePercentage: Number(debate.feePercentage),
        identityRegistry: debate.identityRegistry as Hex,
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
        graphql<{ Debate: IndexedDebateSummaryRow[] }>(INDEXER_LIST_QUERY, { chainId: await chainId() }),
        client.getBlock(),
      ]);
      const chainTime = Math.max(Number(latestBlock.timestamp), Math.floor(Date.now() / 1000));
      const summaries = await Promise.all(
        data.Debate.map(async (row) => {
          const { bountyRaw, ...summary } = summaryFromIndex(row, chainTime);
          return { ...summary, bounty: await enrichBounty(bountyRaw) };
        }),
      );
      // Debate entity IDs are strings, so Hasura cannot order them numerically.
      return summaries.sort((a, b) => a.id - b.id);
    },

    async userState(debateId: number, account: string): Promise<UserState> {
      const data = await graphql<{ Participant: Array<{ tokens: string }>; BountyClaim: Array<{ amount: string }> }>(
        INDEXER_USER_STATE_QUERY,
        { participantId: participantKey(await chainId(), debateId, account) },
      );
      // A Participant row exists only once the account has joined; a BountyClaim row once it claimed.
      const [participant] = data.Participant;
      const bountyClaimed = data.BountyClaim.length > 0;
      return participant
        ? { joined: true, tokens: Number(participant.tokens), bountyClaimed }
        : { joined: false, tokens: 0, bountyClaimed };
    },

    async argumentPosition(debateId: number, argumentId: number, account: string): Promise<ArgumentPosition> {
      const chain = await chainId();
      const data = await graphql<{
        Position: Array<{ proShares: string; conShares: string }>;
        Argument: Array<{ creator: string; fees: string }>;
      }>(INDEXER_ARGUMENT_POSITION_QUERY, {
        positionId: `${argumentKey(chain, debateId, argumentId)}_${account.toLowerCase()}`,
        argumentId: argumentKey(chain, debateId, argumentId),
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
      // The indexer keys positions by participant, exactly the account's share holdings across
      // this debate's arguments.
      const data = await graphql<{ Position: IndexedPositionRow[] }>(INDEXER_POSITIONS_QUERY, {
        participantId: participantKey(await chainId(), debateId, account),
      });
      return data.Position.map((row) => ({
        argumentId: argumentIdIn(row.argument_id),
        proShares: Number(row.proShares),
        conShares: Number(row.conShares),
      })).filter((position) => position.proShares > 0 || position.conShares > 0);
    },

    async feesEarned(debateId: number, argumentId: number): Promise<number> {
      // The index folds every stake's fee into a lifetime total, which the author's claim does
      // not zero - unlike the argument's standing `fees` balance, which it does. This used to sum
      // the argument's whole stake history client-side, one row per stake ever placed on it.
      const data = await graphql<{ Argument: Array<{ feesEarned: string }> }>(INDEXER_ARGUMENT_FEES_QUERY, {
        argumentId: argumentKey(await chainId(), debateId, argumentId),
      });
      const [argument] = data.Argument;
      return argument ? Number(argument.feesEarned) : 0;
    },

    async markets(debateId: number): Promise<ArgumentMarket[]> {
      const data = await graphql<{ Argument: IndexedMarketRow[] }>(INDEXER_MARKETS_QUERY, {
        debateId: debateKey(await chainId(), debateId),
      });
      return data.Argument.map(marketFromIndex);
    },

    async history(debateId: number): Promise<StakeEvent[]> {
      // Every stake in the debate, matched by the prefix its arguments' keys share.
      const data = await graphql<{ Stake: IndexedStakeRow[] }>(INDEXER_HISTORY_QUERY, {
        argumentPrefix: `${debateKey(await chainId(), debateId)}\\_%`,
      });
      return data.Stake.map((row) => ({
        argumentId: argumentIdIn(row.argument_id),
        isPro: row.isPro,
        staked: Number(row.voteTokensStaked),
        fee: Number(row.fee),
        sharesOut: Number(row.sharesOut),
        at: Number(row.timestamp),
      }));
    },

    async participants(debateId: number): Promise<DebateParticipant[]> {
      const data = await graphql<{ Participant: Array<{ account: string; tokens: string }> }>(
        INDEXER_PARTICIPANTS_QUERY,
        { debateId: debateKey(await chainId(), debateId) },
      );
      return data.Participant.map((row) => ({ account: row.account, tokens: Number(row.tokens) }));
    },

    async registries(account?: string): Promise<IdentityRegistryInfo[]> {
      const data = await graphql<{
        IdentityRegistry: Array<{
          address: string;
          kind: 'ALLOWLIST' | 'CIRCLES';
          owner: string | null;
          anchor: string | null;
          requireHuman: boolean | null;
        }>;
      }>(INDEXER_REGISTRIES_QUERY, { chainId: await chainId(), owner: account?.toLowerCase() ?? '' });
      return data.IdentityRegistry.map((row) => ({
        address: getAddress(row.address),
        kind: row.kind === 'ALLOWLIST' ? 'allowlist' : 'circles',
        ...(row.owner ? { owner: getAddress(row.owner) } : {}),
        ...(row.anchor ? { anchor: getAddress(row.anchor) } : {}),
        ...(row.requireHuman !== null ? { requireHuman: row.requireHuman } : {}),
      }));
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
    feesEarned: guarded((source) => source.feesEarned.bind(source)),
    markets: guarded((source) => source.markets.bind(source)),
    history: guarded((source) => source.history.bind(source)),
    participants: guarded((source) => source.participants.bind(source)),
    registries: guarded((source) => source.registries.bind(source)),
  };
}

/**
 * Picks the debate source: the indexer (with the chain as fallback) when configured,
 * plain chain reads otherwise, and the bundled sample debate without any deployment.
 */
/**
 * The read source for a deployment - the indexer where one is configured, backed by the chain, and
 * the bundled sample debate when there is no deployment at all.
 *
 * Takes the config rather than reading it, because which deployment is in play is now a property
 * of the route: switching network has to build a new source pointed at that network's contract and
 * indexer, and a source that read the environment for itself could only ever be the first one.
 */
export function sourceFor(config: ContractConfig | null): DebateSource {
  if (!config) {
    return mockSource;
  }
  const chain = contractSource(config.address, config.rpcUrl);
  return config.indexerUrl ? withFallback(indexerSource(config.indexerUrl, config.rpcUrl), chain) : chain;
}
