import { createPublicClient, http, hexToBytes, hexToString, type Address, type Hex } from 'viem';
import abi from '../abi/ArborVote.abi.json';
import { fetchTextByDigest } from '../lib/ipfs';
import type { ArgumentNode, Debate, Phase } from '../types';
import { climateDebate } from './climateDebate';

export interface DebateSource {
  load(debateId: number): Promise<Debate>;
}

export const mockSource: DebateSource = {
  load: async () => climateDebate,
};

const PHASE_BY_STATUS: Record<number, Phase> = {
  1: 'editing',
  2: 'rating',
  3: 'tallying',
  4: 'finished',
};

interface OnChainArgument {
  contentURI: Hex;
  isSupporting: boolean;
  state: number;
  parentArgumentId: number;
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

      const [currentPhase] = (await client.readContract({
        address,
        abi,
        functionName: 'phases',
        args: [id],
      })) as [number, bigint, bigint, bigint];

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
                approval: marketSize === 0 ? 0.5 : argument.pro / marketSize,
                weight: argument.votes,
                state: argument.state,
              };
            }),
        )
      )
        .filter((node) => node.state !== 0)
        .map(({ state: _state, ...node }) => node);

      return { id: debateId, phase: PHASE_BY_STATUS[currentPhase] ?? 'editing', nodes };
    },
  };
}

/** Picks the contract source when configured via env, the sample debate otherwise. */
export function defaultSource(): DebateSource {
  const address = import.meta.env.VITE_ARBORVOTE_ADDRESS as Address | undefined;
  const rpcUrl = import.meta.env.VITE_RPC_URL as string | undefined;
  const ipfsGateway = import.meta.env.VITE_IPFS_GATEWAY as string | undefined;
  return address && rpcUrl ? contractSource(address, rpcUrl, ipfsGateway) : mockSource;
}
