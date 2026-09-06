import { createContext, useContext, useState } from 'react';
import { actionErrorMessage } from '../data/actions';
import type { AnnouncedWallet } from '../wallet/useWallet';

/** The wallets this browser announced, and the way into one. */
export interface ConnectAccess {
  wallets: AnnouncedWallet[];
  connect: (wallet: AnnouncedWallet) => Promise<void>;
  /** Whether the page is framed, where the account is the host's and not the reader's to pick. */
  embedded: boolean;
}

/** Null where nothing is signed, as in sample mode. */
export const Connect = createContext<ConnectAccess | null>(null);

/** One sentence for one situation, wherever the reader meets it. */
export const NO_WALLET_FOUND = 'No wallet extensions found. Install MetaMask or another browser wallet, then reload.';

/**
 * The same situation inside the Gnosis App, where the answer is different. The account is the
 * host's Safe, so a browser wallet is not the way in and naming one would send the reader to
 * install something that cannot help.
 */
export const NO_HOSTED_ACCOUNT = 'The Gnosis App has not connected an account yet.';

/**
 * Connecting where the action is.
 *
 * The control in the header drops its list at the top of the page, which a modal covers, so an
 * action inside one used to send the reader out of what they were doing and back in again. This
 * offers the same wallets in place, and the action it was holding up appears as soon as one
 * answers.
 *
 * It renders no box of its own, so it sits either in a column of settings or in a row of buttons,
 * wherever the action it stands in for would have gone.
 */
export function ConnectHere({ why }: { why?: string }) {
  const access = useContext(Connect);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!access) return null;
  if (access.embedded) return <p className="composer-hint">{NO_HOSTED_ACCOUNT}</p>;
  if (access.wallets.length === 0) return <p className="composer-hint">{NO_WALLET_FOUND}</p>;

  const choose = async (wallet: AnnouncedWallet) => {
    setConnecting(wallet.info.uuid);
    setError(null);
    try {
      await access.connect(wallet);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setConnecting(null);
    }
  };

  return (
    <>
      {why && <p className="composer-hint">{why}</p>}
      {access.wallets.map((wallet) => (
        <button
          key={wallet.info.uuid}
          type="button"
          className="btn btn-solid connect-here"
          disabled={connecting !== null}
          onClick={() => void choose(wallet)}
        >
          <img src={wallet.info.icon} alt="" className="wallet-icon" />
          {connecting === wallet.info.uuid ? 'Connecting…' : `Connect ${wallet.info.name}`}
        </button>
      ))}
      {error && <p className="action-error">{error}</p>}
    </>
  );
}
