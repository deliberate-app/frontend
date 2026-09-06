import { createContext, useContext } from 'react';

/**
 * Whether the mini-app host holds the account this page is acting for.
 *
 * The Gnosis App runs mini apps in a frame and signs for them with a Safe it holds, and that Safe
 * is a Circles account. So this is what the Circles options hang on - a registry that admits by
 * Circles trust, and the group token as a bounty. Elsewhere the reader has no such account, and
 * those options would be ones they could pick and never pass.
 *
 * False everywhere else, which is every standalone visit.
 */
export const HostedAccount = createContext(false);

export const useHostedAccount = () => useContext(HostedAccount);
