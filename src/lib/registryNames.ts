import { useSyncExternalStore } from 'react';

/** What the reader calls their allowlists, by lowercase address. */
export type RegistryNames = Record<string, string>;

const STORAGE_KEY = 'deliberate.registryNames';

/**
 * The names after naming one registry. A blank name removes the entry rather than storing an empty
 * string, so a cleared field leaves the address to speak for itself.
 */
export function nextNames(current: RegistryNames, address: string, name: string): RegistryNames {
  const key = address.toLowerCase();
  const trimmed = name.trim();
  if (trimmed === '') {
    const { [key]: _removed, ...rest } = current;
    return rest;
  }
  return { ...current, [key]: trimmed };
}

/** The names in stored text, ignoring anything that is not a `{address: name}` object. */
export function parseNames(stored: string | null): RegistryNames {
  if (stored === null) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([address, name]) =>
        typeof name === 'string' && name !== '' ? [[address.toLowerCase(), name]] : [],
      ),
    );
  } catch {
    return {};
  }
}

/**
 * The names live in this browser, not on the chain.
 *
 * `AllowlistIdentityRegistry` has no name to write to, so a name given here is the reader's own
 * note and nobody else sees it. Every view that shows a name says so. Putting names on the
 * registry itself needs a new factory, which `TODO.md` records.
 */
let names: RegistryNames | null = null;
const listeners = new Set<() => void>();

function load(): RegistryNames {
  if (names === null) {
    try {
      names = parseNames(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
    } catch {
      // A browser that refuses storage still runs the app; the addresses carry the meaning.
      names = {};
    }
  }
  return names;
}

/** Names a registry, or clears its name when given a blank one. */
export function setRegistryName(address: string, name: string): void {
  names = nextNames(load(), address, name);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // The name still holds for this session.
  }
  listeners.forEach((listener) => listener());
}

/** Every name this browser holds, re-read whenever one changes. */
export function useRegistryNames(): RegistryNames {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    () => ({}),
  );
}
