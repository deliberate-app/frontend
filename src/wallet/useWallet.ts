import { isMiniappMode, onWalletChange } from '@aboutcircles/miniapp-sdk';
import { useCallback, useEffect, useState } from 'react';
import { createWalletClient, custom, getAddress, type Address, type EIP1193Provider } from 'viem';

import { HOST_CHAIN_ID } from '../lib/chains';

/**
 * Whether this page is embedded at all, which is all the SDK can tell us: its check is
 * `window.parent !== window`, so any site that frames the app answers yes.
 *
 * Being embedded is therefore only a reason to listen. The app counts itself hosted once a host has
 * actually named an account, and until then keeps offering the browser wallets - a page framed by
 * something that is not the Gnosis App would otherwise have no way in at all.
 */
const EMBEDDED = isMiniappMode();

/** An EIP-6963 announced wallet provider. */
export interface AnnouncedWallet {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EIP1193Provider;
}

interface EIP6963AnnounceEvent extends Event {
  detail: AnnouncedWallet;
}

export interface WalletState {
  /**
   * Whether the page is running inside a frame, which is all the mini-app SDK can tell us. In the
   * Gnosis App the account is the host's Safe, so there is nothing here for the reader to connect
   * and no browser wallet to offer them.
   */
  embedded: boolean;
  /**
   * Whether the mini-app host holds the account: it has named one, so it signs and pays. True
   * only once that has happened, never merely because the page is in a frame.
   */
  hosted: boolean;
  /** Wallets discovered via EIP-6963 (MetaMask, Rabby, Coinbase Wallet, ...). */
  wallets: AnnouncedWallet[];
  /** The connected account, if any. */
  account: Address | null;
  /** The connected wallet's EIP-1193 provider, for sending transactions. */
  provider: EIP1193Provider | null;
  /** Name of the connected wallet. */
  walletName: string | null;
  /**
   * The chain the connected wallet is on right now - which is not necessarily the deployment's,
   * and changes underneath the app whenever the user switches network in the wallet itself.
   */
  chainId: number | null;
  connect(wallet: AnnouncedWallet): Promise<void>;
  disconnect(): void;
}

export function useWallet(): WalletState {
  const [wallets, setWallets] = useState<AnnouncedWallet[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  // The host's account, which it connects and disconnects on its own. Held apart from `account` so
  // the two ways in cannot overwrite each other.
  const [hostedAccount, setHostedAccount] = useState<Address | null>(null);
  const [connected, setConnected] = useState<AnnouncedWallet | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // The host announces its account, and announces again whenever it changes. Listening costs
  // nothing where no host is there to answer.
  useEffect(() => {
    if (!EMBEDDED) return;
    return onWalletChange((address) => setHostedAccount(address === null ? null : getAddress(address)));
  }, []);

  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const wallet = (event as EIP6963AnnounceEvent).detail;
      setWallets((known) => (known.some((w) => w.info.uuid === wallet.info.uuid) ? known : [...known, wallet]));
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  useEffect(() => {
    if (!connected) return;
    // An empty account list is how a wallet reports that the user revoked this site's access from
    // inside the wallet. Dropping only the account would leave the app showing the wallet's name
    // next to nothing, so the whole connection goes.
    const onAccountsChanged = (accounts: unknown) => {
      const [first] = accounts as Address[];
      setAccount(first ?? null);
      if (!first) setConnected(null);
    };
    const onDisconnect = () => {
      setAccount(null);
      setConnected(null);
    };
    connected.provider.on('accountsChanged', onAccountsChanged);
    connected.provider.on('disconnect', onDisconnect);
    return () => {
      connected.provider.removeListener('accountsChanged', onAccountsChanged);
      connected.provider.removeListener('disconnect', onDisconnect);
    };
  }, [connected]);

  // The wallet's network, read once on connect and then tracked - a user switching network in the
  // wallet is a normal thing to do mid-visit, and the app has to notice rather than find out at
  // signing time.
  useEffect(() => {
    if (!connected) {
      setChainId(null);
      return;
    }
    let cancelled = false;
    const onChainChanged = (id: unknown) => setChainId(Number(id));
    void connected.provider
      .request({ method: 'eth_chainId' })
      .then((id) => {
        if (!cancelled) setChainId(Number(id));
      })
      .catch(() => {
        if (!cancelled) setChainId(null);
      });
    connected.provider.on('chainChanged', onChainChanged);
    return () => {
      cancelled = true;
      connected.provider.removeListener('chainChanged', onChainChanged);
    };
  }, [connected]);

  const connect = useCallback(async (wallet: AnnouncedWallet) => {
    const client = createWalletClient({ transport: custom(wallet.provider) });
    const [address] = await client.requestAddresses();
    setAccount(address ?? null);
    setConnected(address ? wallet : null);
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setConnected(null);
  }, []);

  const hosted = hostedAccount !== null;
  return {
    embedded: EMBEDDED,
    hosted,
    // A host that has named an account has answered the question the picker asks.
    wallets: hosted ? [] : wallets,
    account: hostedAccount ?? account,
    // No provider when hosted: the host signs, and nothing may reach past it for one.
    provider: hosted ? null : (connected?.provider ?? null),
    walletName: hosted ? 'Gnosis App' : (connected?.info.name ?? null),
    // The host is on Gnosis Chain, so the connection names its network like any other. A mismatch
    // still shows - it is worth knowing - but the offer to switch does not, since that needs a
    // provider and the reader cannot move the host anyway.
    chainId: hosted ? HOST_CHAIN_ID : chainId,
    connect,
    disconnect,
  };
}
