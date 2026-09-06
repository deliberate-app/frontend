import { useEffect, useState } from 'react';
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
  /** Where the avatar's full profile lives, which is where its picture is. */
  cid?: string;
}

/** One row of the service's answer, as far as this app reads it. */
interface ProfileRow {
  address?: unknown;
  name?: unknown;
  avatarType?: unknown;
  description?: unknown;
  CID?: unknown;
}

const KINDS: ReadonlySet<string> = new Set<CirclesAvatarKind>(['human', 'group', 'organization']);

/** The avatars in a service answer, dropping rows without a usable address, name or kind. */
export function parseCirclesProfiles(rows: unknown): CirclesAvatar[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((row: ProfileRow) => {
    const { address, name, avatarType, description, CID } = row;
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
        ...(typeof CID === 'string' && CID !== '' ? { cid: CID } : {}),
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

/**
 * The lookups already made, by lowercase address. What Circles calls an account is a fact about the
 * account, not about the view asking, so the answer outlives the dialog: a list reopened, a tab
 * flipped back, or one avatar appearing on twenty rows costs one request. The pending request is
 * cached too, so twenty rows asking at once ask once.
 *
 * A request that fails leaves the map, so a network blip is not permanent.
 */
const avatarRequests = new Map<string, Promise<CirclesAvatar | null>>();

/** The avatars whose name matches, groups and organizations first: the ones a registry is anchored on. */
export async function searchCirclesAvatars(query: string, signal?: AbortSignal): Promise<CirclesAvatar[]> {
  const trimmed = query.trim();
  if (trimmed === '') {
    return [];
  }
  const rank: Record<CirclesAvatarKind, number> = { group: 0, organization: 1, human: 2 };
  const avatars = await search({ name: trimmed }, signal);
  for (const avatar of avatars) {
    // What the search returned is what an address lookup would return, so remember it as one.
    avatarRequests.set(avatar.address.toLowerCase(), Promise.resolve(avatar));
  }
  return avatars.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** The avatar at an address, or null where Circles knows none. Asked once per address per page. */
export function circlesAvatarOf(address: string): Promise<CirclesAvatar | null> {
  const key = address.toLowerCase();
  const pending = avatarRequests.get(key);
  if (pending) {
    return pending;
  }
  const request = search({ address: key })
    .then(([avatar]) => avatar ?? null)
    .catch(() => {
      avatarRequests.delete(key);
      return null;
    });
  avatarRequests.set(key, request);
  return request;
}

/**
 * An avatar's picture, by the CID its profile lives at.
 *
 * The search answer names the profile but does not carry it, so the picture is a second lookup and
 * one this app makes only where it will be shown. The document holds the small preview as a data
 * URI, so there is no image request after it and no gateway to depend on.
 *
 * Cached and de-duplicated like the avatars themselves: one avatar on twenty rows costs one
 * request, and a failure leaves the map so a blip is not permanent.
 */
const pictureRequests = new Map<string, Promise<string | null>>();

export function circlesPictureOf(cid: string): Promise<string | null> {
  const pending = pictureRequests.get(cid);
  if (pending) {
    return pending;
  }
  const request = fetch(`https://rpc.aboutcircles.com/profiles/get?cid=${encodeURIComponent(cid)}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((profile: { previewImageUrl?: unknown } | null) =>
      typeof profile?.previewImageUrl === 'string' && profile.previewImageUrl.startsWith('data:image/')
        ? profile.previewImageUrl
        : null,
    )
    .catch(() => {
      pictureRequests.delete(cid);
      return null;
    });
  pictureRequests.set(cid, request);
  return request;
}

/** What Circles knows about one account: nothing at all, or a name and perhaps a picture. */
export interface CirclesIdentity {
  name?: string;
  picture?: string;
}

/**
 * What Circles knows about one account, for the places that show an account.
 *
 * `wanted` is what decides whether to ask at all, so a page outside the Gnosis App makes no
 * lookups: there the reader has no Circles account and every byline is an address.
 */
export function useCirclesIdentity(address: string | undefined, wanted: boolean): CirclesIdentity {
  const [identity, setIdentity] = useState<CirclesIdentity>({});

  useEffect(() => {
    if (!wanted || !address) return;
    let stale = false;
    void circlesAvatarOf(address).then(async (avatar) => {
      if (stale || !avatar) return;
      setIdentity({ name: avatar.name });
      if (!avatar.cid) return;
      const picture = await circlesPictureOf(avatar.cid);
      if (!stale && picture) setIdentity({ name: avatar.name, picture });
    });
    return () => {
      stale = true;
    };
  }, [address, wanted]);

  return identity;
}

/**
 * The avatars matching a name, a moment after typing stops.
 *
 * Both places that look an avatar up by name - anchoring a registry, and filtering the debate list
 * by creator - want the same debounce, the same abort when the query moves on, and the same "no
 * answer reads as no matches". Written twice they drifted on the first day, so they are written
 * here once. Null means nothing has been asked yet, which a caller may show differently from an
 * answer of none.
 */
export function useCirclesAvatarSearch(query: string, wanted: boolean): CirclesAvatar[] | null {
  const [found, setFound] = useState<CirclesAvatar[] | null>(null);
  const asked = query.trim();

  useEffect(() => {
    if (!wanted || asked === '') {
      setFound(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchCirclesAvatars(asked, controller.signal)
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [asked, wanted]);

  return found;
}

/**
 * The Circles names for a set of accounts. An account Circles does not know is absent from the
 * answer, so a caller reads `names[address]` and falls back to the address itself.
 *
 * The effect follows the addresses by their joined text rather than by the array, because a caller
 * derives that array on each render and only its contents matter.
 */
export function useCirclesNames(addresses: readonly string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const wanted = addresses.join(',');

  useEffect(() => {
    if (wanted === '') return;
    let stale = false;
    void Promise.all(wanted.split(',').map(async (address) => [address, await circlesAvatarOf(address)] as const)).then(
      (found) => {
        if (stale) return;
        const named = found.flatMap(([address, avatar]) => (avatar ? [[address, avatar.name] as const] : []));
        setNames((known) => {
          const fresh = named.filter(([address]) => known[address] === undefined);
          return fresh.length === 0 ? known : { ...known, ...Object.fromEntries(fresh) };
        });
      },
    );
    return () => {
      stale = true;
    };
  }, [wanted]);

  return names;
}
