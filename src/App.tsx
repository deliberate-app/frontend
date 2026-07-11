import { useCallback, useEffect, useMemo, useState } from 'react';
import { DebateView, type DebateTx } from './components/DebateView';
import { WalletMenu } from './components/WalletMenu';
import {
  actionErrorMessage,
  connectDebateActions,
  type DebateActions,
  type UserState,
} from './data/actions';
import { contractConfig } from './data/config';
import { defaultSource } from './data/source';
import type { Debate } from './types';
import { PHASE_LABEL } from './types';
import { useWallet } from './wallet/useWallet';

const source = defaultSource();
const config = contractConfig();
const DEBATE_ID = 0;

export default function App() {
  const [debate, setDebate] = useState<Debate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const wallet = useWallet();

  useEffect(() => {
    source
      .load(DEBATE_ID)
      .then(setDebate)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  // The action layer exists once a wallet is connected against an on-chain deployment.
  const [actions, setActions] = useState<DebateActions | null>(null);
  useEffect(() => {
    if (!config || !wallet.account || !wallet.provider) {
      setActions(null);
      return;
    }
    let cancelled = false;
    connectDebateActions(config, wallet.provider, wallet.account)
      .then((connected) => {
        if (!cancelled) setActions(connected);
      })
      .catch(() => setActions(null));
    return () => {
      cancelled = true;
    };
  }, [wallet.account, wallet.provider]);

  const [userState, setUserState] = useState<UserState | null>(null);
  useEffect(() => {
    if (!actions) {
      setUserState(null);
      return;
    }
    let cancelled = false;
    actions
      .userState(DEBATE_ID)
      .then((state) => {
        if (!cancelled) setUserState(state);
      })
      .catch(() => setUserState(null));
    return () => {
      cancelled = true;
    };
  }, [actions, reloadKey]);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const join = async () => {
    if (!actions) return;
    setJoining(true);
    setJoinError(null);
    try {
      await actions.join(DEBATE_ID);
      refresh();
    } catch (cause) {
      setJoinError(actionErrorMessage(cause));
    } finally {
      setJoining(false);
    }
  };

  const joinable =
    actions !== null &&
    userState !== null &&
    !userState.joined &&
    (debate?.phase === 'editing' || debate?.phase === 'rating');

  const tx: DebateTx | null = useMemo(() => {
    if (!actions || !userState) return null;
    return {
      joined: userState.joined,
      tokens: userState.tokens,
      addArgument: async (parentArgumentId, side, initialApproval, text) => {
        await actions.addArgument(DEBATE_ID, parentArgumentId, side, initialApproval, text);
        refresh();
      },
      invest: async (argumentId, side, amount) => {
        await actions.invest(DEBATE_ID, argumentId, side, amount);
        refresh();
      },
      position: (argumentId) => actions.position(DEBATE_ID, argumentId),
      redeem: async (argumentId) => {
        await actions.redeemShares(DEBATE_ID, argumentId);
        refresh();
      },
      claimFees: async (argumentId) => {
        await actions.claimFees(DEBATE_ID, argumentId);
        refresh();
      },
    };
  }, [actions, userState, refresh]);

  return (
    <>
      <header className="topbar">
        <span className="wordmark">ArborVote</span>
        {debate && <span className={`phase phase-${debate.phase}`}>{PHASE_LABEL[debate.phase]}</span>}
        <span className="topbar-spacer" />
        {userState?.joined && (
          <span className="tokens" title="Your vote token balance">
            <strong className="mono">{userState.tokens}</strong> ⬡
          </span>
        )}
        {joinable && (
          <button type="button" className="btn btn-solid" onClick={join} disabled={joining}>
            {joining ? 'Joining…' : 'Join debate'}
          </button>
        )}
        <WalletMenu wallet={wallet} />
      </header>

      {joinError && <p className="load-error">Could not join: {joinError}</p>}
      {error && (
        <p className="load-error">
          Could not load the debate: {error}. Check VITE_ARBORVOTE_ADDRESS and VITE_RPC_URL, or
          unset them to browse the sample debate.
        </p>
      )}
      {!error && !debate && <p className="load-note">Loading debate…</p>}
      {debate && <DebateView debate={debate} tx={tx} />}
    </>
  );
}
