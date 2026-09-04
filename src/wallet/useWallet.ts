import { useCallback, useEffect, useState } from 'react';
import { createWalletClient, custom, type Address, type EIP1193Provider } from 'viem';

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
  /** Whether the wallet picker is showing. */
  picking: boolean;
  /**
   * Opens the wallet picker. For action sites that need a wallet the visitor has not connected
   * yet: they ask for a connection rather than presenting a dead disabled control.
   */
  promptConnect(): void;
  dismissPrompt(): void;
  connect(wallet: AnnouncedWallet): Promise<void>;
  disconnect(): void;
}

export function useWallet(): WalletState {
  const [wallets, setWallets] = useState<AnnouncedWallet[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  const [connected, setConnected] = useState<AnnouncedWallet | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);

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
    // Whatever opened the picker has been answered; leaving it up over a connected app would
    // cover the very view the visitor asked to reach.
    if (address) setPicking(false);
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setConnected(null);
  }, []);

  const promptConnect = useCallback(() => setPicking(true), []);
  const dismissPrompt = useCallback(() => setPicking(false), []);

  return {
    wallets,
    account,
    provider: connected?.provider ?? null,
    walletName: connected?.info.name ?? null,
    chainId,
    picking,
    promptConnect,
    dismissPrompt,
    connect,
    disconnect,
  };
}
