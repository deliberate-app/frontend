import { createContext, useContext } from 'react';

/**
 * Whether the Circles mini-app host holds the account this page is acting for.
 *
 * The Circles options - a registry that admits by Circles trust, and the group token as a bounty -
 * only mean something to an account Circles knows. Outside the Circles app the reader has no such
 * account, so those options are left out rather than offered and refused.
 *
 * False everywhere else, which is every standalone visit.
 */
export const CirclesApp = createContext(false);

export const useCirclesApp = () => useContext(CirclesApp);
