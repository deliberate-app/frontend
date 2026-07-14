import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowseView } from './components/BrowseView';
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
import type { DebateSchedule } from './lib/debateTiming';
import { useNow } from './lib/time';
import type { Debate, DebateFilter, DebateSummary } from './types';
import { availablePhasePoke, PHASE_LABEL } from './types';
import { useWallet } from './wallet/useWallet';

const source = defaultSource();
const config = contractConfig();

// A just-created debate is mined, but the load-balanced RPC / hosted indexer can briefly
// serve a node that has not seen its block yet - so the reader waits it out with a spinner.
const SYNC_RETRY_MS = 2000;
const SYNC_MAX_RETRIES = 15; // ~30 s, comfortably longer than the usual lag

// The vote tokens the contract grants on joining (Parameters.INITIAL_TOKENS); lets a join reflect
// immediately without waiting on the indexer to process the Joined event.
const INITIAL_TOKENS = 100;

/** `#/debate/N` opens a debate; anything else is the browse home. */
function routeFromHash(): number | null {
  const match = /^#\/debate\/(\d+)$/.exec(window.location.hash);
  return match ? Number(match[1]) : null;
}

export default function App() {
  const [debateId, setDebateId] = useState<number | null>(routeFromHash);
  const [debate, setDebate] = useState<Debate | null>(null);
  const [debates, setDebates] = useState<DebateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True while waiting out the read lag of a debate we just created (spinner, not an error).
  const [syncing, setSyncing] = useState(false);
  const [userState, setUserState] = useState<UserState | null>(null);
  // Browse filter/sort lives here, not in BrowseView, so it survives navigating
  // into a debate and back (BrowseView unmounts while a debate is open).
  const [filter, setFilter] = useState<DebateFilter>({ status: 'all', thesis: '', author: '', sort: 'recent' });
  const wallet = useWallet();
  const now = useNow();

  useEffect(() => {
    const onHashChange = () => setDebateId(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const openDebate = (id: number) => {
    window.location.hash = `#/debate/${id}`;
  };

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
      .catch(() => {
        // A superseded connect must not clobber the newer wallet's action layer.
        if (!cancelled) setActions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.account, wallet.provider]);

  // Reloads are awaited by the actions, so their buttons stay busy until the
  // view is fresh - releasing on the transaction receipt alone would leave a
  // window where a stale gate invites a doomed second submission.
  //
  // refresh is a STABLE callback that reads the live route from a ref rather than
  // closing over debateId: an action started on one debate can resolve (its wallet
  // prompt sits open) after the user has navigated elsewhere, and its awaited
  // refresh() must reload the CURRENT route, never write the old debate's data
  // under the new one. loadSeq still drops out-of-order responses within a route.
  const debateIdRef = useRef(debateId);
  const actionsRef = useRef<DebateActions | null>(null);
  const loadSeq = useRef(0);
  // The id of a debate we just created (its receipt is mined, so it definitely exists);
  // its transient not-found reads are retried rather than surfaced as an error.
  const awaitingCreateRef = useRef<number | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadAttemptRef = useRef(0);
  // Set when we optimistically mark the account joined on a successful join tx, so a lagging
  // indexer read does not revert it before the Joined event is processed.
  const optimisticJoinRef = useRef(false);
  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    const target = debateIdRef.current;

    if (target === null) {
      try {
        const list = await source.list();
        if (seq !== loadSeq.current) return;
        setDebates(list);
        setError(null);
      } catch (cause) {
        if (seq !== loadSeq.current) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
      return;
    }

    const connected = actionsRef.current;
    const [debateResult, stateResult] = await Promise.allSettled([
      source.load(target),
      connected ? source.userState(target, connected.account) : Promise.resolve(null),
    ]);
    // Drop the response if a newer refresh started or the route changed underneath us.
    if (seq !== loadSeq.current || debateIdRef.current !== target) return;
    if (debateResult.status === 'fulfilled') {
      setDebate(debateResult.value);
      setError(null);
      setSyncing(false);
      loadAttemptRef.current = 0;
      if (awaitingCreateRef.current === target) awaitingCreateRef.current = null;
    } else {
      const cause = debateResult.reason as unknown;
      const message = cause instanceof Error ? cause.message : String(cause);
      // A debate we just created definitely exists; a not-found only means the read
      // RPC / indexer lags the write, so keep a spinner and retry instead of erroring.
      if (awaitingCreateRef.current === target && loadAttemptRef.current < SYNC_MAX_RETRIES) {
        loadAttemptRef.current += 1;
        setSyncing(true);
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => void refresh(), SYNC_RETRY_MS);
      } else {
        setError(message);
        setSyncing(false);
        awaitingCreateRef.current = null;
      }
    }
    const nextState = stateResult.status === 'fulfilled' ? stateResult.value : null;
    // A just-joined account may not be in the index yet; keep the optimistic joined state rather
    // than let a lagging read revert it. Clear the guard once the index confirms the join.
    if (optimisticJoinRef.current && nextState !== null && !nextState.joined) return;
    if (nextState?.joined) optimisticJoinRef.current = false;
    setUserState(nextState);
  }, []);

  // Route changes drop the previous view's data and reload for the new route.
  useEffect(() => {
    debateIdRef.current = debateId;
    setDebate(null);
    setUserState(null);
    setError(null);
    setSyncing(false);
    loadAttemptRef.current = 0;
    clearTimeout(retryTimerRef.current);
    // Keep the just-created marker only while it matches the route we are landing on.
    if (awaitingCreateRef.current !== debateId) awaitingCreateRef.current = null;
    void refresh();
  }, [debateId, refresh]);

  // Cancel any pending sync retry when the app unmounts.
  useEffect(() => () => clearTimeout(retryTimerRef.current), []);

  // A wallet connect/disconnect reloads too (it adds or removes the user's state).
  useEffect(() => {
    actionsRef.current = actions;
    void refresh();
  }, [actions, refresh]);

  // Poll on-chain state so other participants' moves and newly opened
  // time gates (phase pokes, finalizable drafts) show up on their own.
  useEffect(() => {
    if (!config) return;
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const join = async () => {
    if (!actions || debateId === null) return;
    setJoining(true);
    setJoinError(null);
    try {
      await actions.join(debateId);
      // Joining grants a fixed token allotment; reflect it immediately rather than waiting on the
      // indexer to catch up with the Joined event (the tree is unchanged, so no reload is needed).
      optimisticJoinRef.current = true;
      setUserState({ joined: true, tokens: INITIAL_TOKENS });
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

  // Tallying is permissionless - any connected account can finish a debate once its rating window
  // closes. The ticking clock opens the gate live, without waiting for the next poll.
  const poke = actions !== null && debate ? availablePhasePoke(debate, now) : null;
  const [poking, setPoking] = useState(false);
  const [pokeError, setPokeError] = useState<string | null>(null);
  const runPoke = async () => {
    if (!actions || !poke || debateId === null) return;
    setPoking(true);
    setPokeError(null);
    try {
      await actions.tallyTree(debateId);
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
    if (!actions || !userState || debateId === null) return null;
    return {
      account: actions.account,
      joined: userState.joined,
      tokens: userState.tokens,
      addArgument: async (parentArgumentId, side, initialApproval, deposit, text) => {
        await actions.addArgument(debateId, parentArgumentId, side, initialApproval, deposit, text);
        await refresh();
      },
      alterArgument: async (argumentId, text) => {
        await actions.alterArgument(debateId, argumentId, text);
        await refresh();
      },
      moveArgument: async (argumentId, newParentArgumentId, initialApproval) => {
        await actions.moveArgument(debateId, argumentId, newParentArgumentId, initialApproval);
        await refresh();
      },
      stake: async (argumentId, side, amount) => {
        await actions.stake(debateId, argumentId, side, amount);
        await refresh();
      },
      position: (argumentId) => source.argumentPosition(debateId, argumentId, actions.account),
      loadPositions: () => source.positions(debateId, actions.account),
      redeem: async (argumentId) => {
        await actions.redeemShares(debateId, argumentId);
        await refresh();
      },
      redeemBatch: async (argumentIds) => {
        await actions.redeemSharesBatch(debateId, argumentIds);
        await refresh();
      },
      claimFees: async (argumentId) => {
        await actions.claimFees(debateId, argumentId);
        await refresh();
      },
    };
  }, [actions, userState, debateId, refresh]);

  const createDebate = async (thesis: string, schedule: DebateSchedule) => {
    if (!actions) throw new Error('Connect a wallet first.');
    const id = await actions.createDebate(thesis, schedule);
    // The receipt is mined, so the debate exists; mark it so the reader waits out any
    // RPC/indexer lag with a spinner instead of a not-found error.
    awaitingCreateRef.current = id;
    openDebate(id);
  };
  const createDisabledHint = !config
    ? 'Browsing the bundled sample debate - configure a deployment to create debates.'
    : !actions
      ? 'Connect a wallet to create a debate.'
      : null;

  const browsing = debateId === null;

  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="#/">
          ArborVote
        </a>
        {!browsing && (
          <a className="back" href="#/">
            ‹ All debates
          </a>
        )}
        {!browsing && debate && (
          <span className={`phase phase-${debate.phase}`}>{PHASE_LABEL[debate.phase]}</span>
        )}
        {!browsing && debate && <PhaseClock debate={debate} now={now} />}
        {!browsing && poke && (
          <button type="button" className="btn" onClick={runPoke} disabled={poking}>
            {poking ? 'Tallying…' : 'Tally the debate'}
          </button>
        )}
        <span className="topbar-spacer" />
        {!browsing && userState?.joined && (
          <span className="tokens" title="Your vote token balance in this debate">
            <strong className="mono">{userState.tokens}</strong> ⬡
          </span>
        )}
        {!browsing && joinable && (
          <button type="button" className="btn btn-solid" onClick={join} disabled={joining}>
            {joining ? 'Joining…' : 'Join debate'}
          </button>
        )}
        <WalletMenu wallet={wallet} />
      </header>

      {joinError && <p className="load-error">Could not join: {joinError}</p>}
      {pokeError && <p className="load-error">Could not tally the debate: {pokeError}</p>}
      {error && (
        <p className="load-error">
          Could not load {browsing ? 'the debates' : 'the debate'}: {error}. Check
          VITE_ARBORVOTE_ADDRESS and VITE_RPC_URL, or unset them to browse the sample debate.
        </p>
      )}

      {browsing ? (
        debates === null ? (
          !error && <p className="load-note">Loading debates…</p>
        ) : (
          <BrowseView
            debates={debates}
            account={actions?.account}
            filter={filter}
            onFilter={setFilter}
            createDisabledHint={createDisabledHint}
            onOpen={openDebate}
            onCreate={createDebate}
          />
        )
      ) : debate ? (
        <DebateView key={debate.id} debate={debate} tx={tx} />
      ) : (
        !error && (
          <p className="load-note">
            <span className="spinner" aria-hidden />
            {syncing ? 'Creating your debate — waiting for it to sync…' : 'Loading debate…'}
          </p>
        )
      )}
    </>
  );
}
