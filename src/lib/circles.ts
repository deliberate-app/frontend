import { getAddress, isAddress, type Address } from 'viem';

/**
 * Circles names, from the Circles profile service.
 *
 * The service is the one lookup this app makes for a Circles avatar's name: it answers a name query
 * with every avatar whose profile matches, and an address query with that avatar's profile, both over
 * a CORS-enabled GET. The alternatives lost on plumbing rather than data: `circles_query` on the same
 * host sends no CORS header, so the browser could only reach it through a proxy, and indexing the
 * Hub's registration events ourselves would duplicate what this service already serves.
 */
export const CIRCLES_PROFILES_URL = 'https://rpc.aboutcircles.com/profiles/search';

/** The avatar types Circles registers. A registry anchor can be any of them. */
export type CirclesAvatarKind = 'human' | 'group' | 'organization';

export interface CirclesAvatar {
  address: Address;
  name: string;
  kind: CirclesAvatarKind;
  description?: string;
}

/** One row of the service's answer, as far as this app reads it. */
interface ProfileRow {
  address?: unknown;
  name?: unknown;
  avatarType?: unknown;
  description?: unknown;
}

const KINDS: ReadonlySet<string> = new Set<CirclesAvatarKind>(['human', 'group', 'organization']);

/** The avatars in a service answer, dropping rows without a usable address, name or kind. */
export function parseCirclesProfiles(rows: unknown): CirclesAvatar[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((row: ProfileRow) => {
    const { address, name, avatarType, description } = row;
    if (typeof address !== 'string' || !isAddress(address) || typeof name !== 'string' || name === '') {
      return [];
    }
    if (typeof avatarType !== 'string' || !KINDS.has(avatarType)) {
      return [];
    }
    return [
      {
        address: getAddress(address),
        name,
        kind: avatarType as CirclesAvatarKind,
        ...(typeof description === 'string' && description !== '' ? { description } : {}),
      },
    ];
  });
}

async function search(params: Record<string, string>, signal?: AbortSignal): Promise<CirclesAvatar[]> {
  const response = await fetch(`${CIRCLES_PROFILES_URL}?${new URLSearchParams(params)}`, { signal });
  if (!response.ok) {
    throw new Error(`The Circles profile service responded with status ${response.status}`);
  }
  return parseCirclesProfiles(await response.json());
}

/** The avatars whose name matches, groups and organizations first: the ones a registry is anchored on. */
export async function searchCirclesAvatars(query: string, signal?: AbortSignal): Promise<CirclesAvatar[]> {
  const trimmed = query.trim();
  if (trimmed === '') {
    return [];
  }
  const rank: Record<CirclesAvatarKind, number> = { group: 0, organization: 1, human: 2 };
  return (await search({ name: trimmed }, signal)).sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** The avatar at an address, or null where Circles knows none. */
export async function circlesAvatarOf(address: string, signal?: AbortSignal): Promise<CirclesAvatar | null> {
  const [avatar] = await search({ address: address.toLowerCase() }, signal);
  return avatar ?? null;
}
