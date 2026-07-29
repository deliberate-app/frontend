import { useEffect, useRef, type ReactNode } from 'react';
import { WalletMenu } from 'deliberate-frontend';

/** Inline data-URI icons - the real EIP-6963 icons are data URIs too, and no network is available. */
const icon = (fill: string, glyph: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${fill}"/><text x="16" y="22" font-family="sans-serif" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">${glyph}</text></svg>`,
  )}`;

const wallets = [
  { info: { uuid: 'a', name: 'MetaMask', icon: icon('#e2761b', 'M'), rdns: 'io.metamask' }, provider: {} },
  { info: { uuid: 'b', name: 'Rabby Wallet', icon: icon('#7084ff', 'R'), rdns: 'io.rabby' }, provider: {} },
  { info: { uuid: 'c', name: 'Coinbase Wallet', icon: icon('#0052ff', 'C'), rdns: 'com.coinbase' }, provider: {} },
];

const state = (over: Record<string, unknown>) =>
  ({
    wallets,
    account: null,
    provider: null,
    walletName: null,
    connect: async () => {},
    disconnect: () => {},
    ...over,
  }) as never;

/** The menu is a popover; a positioned frame gives it something to sit in. */
const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ width: 380, height: 380, position: 'relative', padding: '0.75rem' }}>{children}</div>
);

/** Opens the menu through its own trigger, the way a user does. */
const Opened = ({ children }: { children: ReactNode }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelector('button')?.click();
  }, []);
  return <div ref={host}>{children}</div>;
};

/** Disconnected: one quiet trigger in the top bar. */
export const Disconnected = () => (
  <Frame>
    <WalletMenu wallet={state({})} />
  </Frame>
);

/** The discovered EIP-6963 wallets, each with the icon its extension announced. */
export const WalletPicker = () => (
  <Frame>
    <Opened>
      <WalletMenu wallet={state({})} />
    </Opened>
  </Frame>
);

/** No extension installed - the menu says what to do instead of showing an empty list. */
export const NoWalletsFound = () => (
  <Frame>
    <Opened>
      <WalletMenu wallet={state({ wallets: [] })} />
    </Opened>
  </Frame>
);

/** Connected: the trigger becomes the account's identicon badge. */
export const Connected = () => (
  <Frame>
    <WalletMenu
      wallet={state({ account: '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9', walletName: 'MetaMask' })}
    />
  </Frame>
);

/** Connected, menu open: which wallet is connected, and the way out. */
export const ConnectedMenu = () => (
  <Frame>
    <Opened>
      <WalletMenu
        wallet={state({ account: '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9', walletName: 'MetaMask' })}
      />
    </Opened>
  </Frame>
);
