export interface Route {
  /** The network the URL names; null on a bare route, or on a build with no named networks. */
  slug: string | null;
  /** The debate the URL opens; null on the browse home. */
  debateId: number | null;
}

/**
 * `#/<network>/debate/N` opens a debate on a named network; `#/<network>` is that network's browse
 * home; `#/` is the default network's.
 *
 * The network segment is what makes a copied link mean the same thing for whoever opens it. Debate
 * 5 on Gnosis and debate 5 on Chiado are unrelated debates, so a URL naming neither would show the
 * recipient whichever network they happened to have selected last - silently the wrong debate, or
 * none. Links written before the segment existed (`#/debate/5`) still resolve, to the first
 * configured network.
 */
export function routeFromHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter((part) => part.length > 0);
  const slug = parts[0] !== undefined && parts[0] !== 'debate' ? parts[0] : null;
  const rest = slug === null ? parts : parts.slice(1);
  const debateId = rest[0] === 'debate' && /^\d+$/.test(rest[1] ?? '') ? Number(rest[1]) : null;
  return { slug, debateId };
}

/** The hash for a route - the inverse of routeFromHash, so every link the app writes round-trips. */
export function hashFor(slug: string | null, debateId: number | null): string {
  const path = [slug, debateId === null ? null : `debate/${debateId}`].filter((part) => part !== null);
  return `#/${path.join('/')}`;
}
