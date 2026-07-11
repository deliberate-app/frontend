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
  connect(wallet: AnnouncedWallet): Promise<void>;
  disconnect(): void;
}

export function useWallet(): WalletState {
  const [wallets, setWallets] = useState<AnnouncedWallet[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  const [connected, setConnected] = useState<AnnouncedWallet | null>(null);

  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const wallet = (event as EIP6963AnnounceEvent).detail;
      setWallets((known) =>
        known.some((w) => w.info.uuid === wallet.info.uuid) ? known : [...known, wallet],
      );
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const onAccountsChanged = (accounts: unknown) => {
      const [first] = accounts as Address[];
      setAccount(first ?? null);
    };
    connected.provider.on('accountsChanged', onAccountsChanged);
    return () => connected.provider.removeListener('accountsChanged', onAccountsChanged);
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

  return {
    wallets,
    account,
    provider: connected?.provider ?? null,
    walletName: connected?.info.name ?? null,
    connect,
    disconnect,
  };
}

export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
