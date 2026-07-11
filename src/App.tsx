import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DebateView, type DebateTx } from './components/DebateView';
import { PhaseClock } from './components/PhaseClock';
import { WalletMenu } from './components/WalletMenu';
import {
  actionErrorMessage,
  connectDebateActions,
  type DebateActions,
  type UserState,
} from './data/actions';
import { contractConfig } from './data/config';
import { defaultSource } from './data/source';
import { useNow } from './lib/time';
import type { Debate, Phase } from './types';
import { availablePhasePoke, PHASE_LABEL } from './types';
import { useWallet } from './wallet/useWallet';

const source = defaultSource();
const config = contractConfig();
const DEBATE_ID = 0;

const POKE_LABEL: Record<Phase, string> = {
  editing: 'Start editing',
  rating: 'Start rating',
  tallying: 'Start tallying',
  finished: 'Tally the debate',
};

export default function App() {
  const [debate, setDebate] = useState<Debate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userState, setUserState] = useState<UserState | null>(null);
  const wallet = useWallet();
  const now = useNow();

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

  // Reloads are awaited by the actions, so their buttons stay busy until the
  // view is fresh - releasing on the transaction receipt alone would leave a
  // window where a stale gate invites a doomed second submission. They are
  // also sequenced: a slow response must never overwrite a newer one.
  const actionsRef = useRef<DebateActions | null>(null);
  const loadSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    const connected = actionsRef.current;
    const [debateResult, stateResult] = await Promise.allSettled([
      source.load(DEBATE_ID),
      connected ? connected.userState(DEBATE_ID) : Promise.resolve(null),
    ]);
    if (seq !== loadSeq.current) return;
    if (debateResult.status === 'fulfilled') {
      setDebate(debateResult.value);
      setError(null);
    } else {
      const cause = debateResult.reason as unknown;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    setUserState(stateResult.status === 'fulfilled' ? stateResult.value : null);
  }, []);

  useEffect(() => {
    actionsRef.current = actions;
    void refresh();
  }, [actions, refresh]);

  // Poll on-chain debates so other participants' moves and newly opened
  // time gates (phase pokes, finalizable drafts) show up on their own.
  useEffect(() => {
    if (!config) return;
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const join = async () => {
    if (!actions) return;
    setJoining(true);
    setJoinError(null);
    try {
      await actions.join(DEBATE_ID);
      await refresh();
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

  // The phase poke is permissionless - any connected account can push the debate along.
  // The ticking clock opens the gate live, without waiting for the next poll.
  const poke = actions !== null && debate ? availablePhasePoke(debate, now) : null;
  const [poking, setPoking] = useState(false);
  const [pokeError, setPokeError] = useState<string | null>(null);
  const runPoke = async () => {
    if (!actions || !poke) return;
    setPoking(true);
    setPokeError(null);
    try {
      await (poke.kind === 'tally' ? actions.tallyTree(DEBATE_ID) : actions.advancePhase(DEBATE_ID));
      await refresh();
    } catch (cause) {
      setPokeError(actionErrorMessage(cause));
    } finally {
      setPoking(false);
    }
  };

  // A failed poke's message is obsolete once the debate moved on regardless -
  // typically because another keeper won the race it lost.
  const phase = debate?.phase;
  useEffect(() => {
    setPokeError(null);
  }, [phase]);

  const tx: DebateTx | null = useMemo(() => {
    if (!actions || !userState) return null;
    return {
      joined: userState.joined,
      tokens: userState.tokens,
      addArgument: async (parentArgumentId, side, initialApproval, text) => {
        await actions.addArgument(DEBATE_ID, parentArgumentId, side, initialApproval, text);
        await refresh();
      },
      stake: async (argumentId, side, amount) => {
        await actions.stake(DEBATE_ID, argumentId, side, amount);
        await refresh();
      },
      position: (argumentId) => actions.position(DEBATE_ID, argumentId),
      redeem: async (argumentId) => {
        await actions.redeemShares(DEBATE_ID, argumentId);
        await refresh();
      },
      claimFees: async (argumentId) => {
        await actions.claimFees(DEBATE_ID, argumentId);
        await refresh();
      },
      finalize: async (argumentId) => {
        await actions.finalizeArgument(DEBATE_ID, argumentId);
        await refresh();
      },
    };
  }, [actions, userState, refresh]);

  return (
    <>
      <header className="topbar">
        <span className="wordmark">ArborVote</span>
        {debate && <span className={`phase phase-${debate.phase}`}>{PHASE_LABEL[debate.phase]}</span>}
        {debate && <PhaseClock debate={debate} now={now} />}
        {poke && (
          <button type="button" className="btn" onClick={runPoke} disabled={poking}>
            {poking ? 'Poking…' : POKE_LABEL[poke.target]}
          </button>
        )}
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
      {pokeError && <p className="load-error">Could not advance the debate: {pokeError}</p>}
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
