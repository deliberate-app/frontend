import { createContext, useContext } from 'react';
import type { Address } from 'viem';
import type { IdentityRegistryInfo } from './source';

/**
 * Everything the app can do with identity registries, in one place.
 *
 * Registries are an account's own property rather than a debate's, so they are read and kept in
 * one manager and merely named by a debate. Passing this through the view tree meant the same six
 * props travelled through views that had no use for them, so it travels as context instead - the
 * way the connected account already does.
 *
 * A writing action is absent, not disabled, where the viewer cannot take it: making a registry
 * needs both a wallet and a factory on this network, and keeping a list needs a wallet. The
 * manager offers what it is given, so there is no second flag to keep in step.
 */
export interface RegistryAccess {
  /** What the index knows: the viewer's own allowlists, and every Circles registry. */
  registries: IdentityRegistryInfo[];
  /** The network's current factory. Factories are immutable and superseded, so older ones are marked. */
  factory?: Address;
  /** The accounts on an allowlist, from the index. */
  loadMembers: (registry: Address) => Promise<Address[]>;
  /** Clones a new allowlist for the viewer, and answers with its address. */
  createAllowlist?: () => Promise<Address>;
  /** Clones a new Circles registry anchored on an avatar, and answers with its address. */
  createCircles?: (anchor: Address, requireHuman: boolean) => Promise<Address>;
  /** Adds or removes accounts on an allowlist; resolves once the index has folded the change. */
  setMembership?: (registry: Address, accounts: Address[], member: boolean) => Promise<void>;
}

/** Null where there is no deployment to read registries from, as in sample mode. */
export const Registries = createContext<RegistryAccess | null>(null);

export const useRegistries = () => useContext(Registries);
