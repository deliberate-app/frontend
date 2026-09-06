import { useEffect, useRef, useState } from 'react';
import { useRegistries } from '../data/registries';
import { chainName, isTestnet } from '../lib/chains';
import { type WalletState } from '../wallet/useWallet';
import { AddressBadge } from './AddressBadge';
import { NO_WALLET_FOUND } from './ConnectHere';
import { Modal } from './Modal';
import { RegistryManager } from './RegistryManager';

const noop = () => undefined;

export function WalletMenu({
  wallet,
  deploymentChainId,
  onSwitchChain,
}: {
  wallet: WalletState;
  /** The chain the configured deployment lives on; null in sample mode, or before it resolves. */
  deploymentChainId?: number | null;
  /** Asks the wallet to move to the deployment's chain; absent when there is no deployment. */
  onSwitchChain?: () => Promise<void>;
}) {
  const registries = useRegistries();
  // Two menus hang off this control - the account menu once connected, and the wallet list before
  // that. Both are this control's own: an action elsewhere that needs a wallet asks for one where
  // it stands (`ConnectHere`) rather than sending the reader up here.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [managing, setManaging] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const connected = wallet.account !== null;
  const open = connected ? accountMenuOpen : picking;
  const close = connected ? () => setAccountMenuOpen(false) : () => setPicking(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [open, close]);

  // A wallet sitting on another network is the app's most common silent failure: every write
  // reverts on a chain that has no contract, and until now the mismatch only surfaced as a switch
  // prompt at signing time. It is a fact about the connection, so it belongs on the connection's
  // control.
  const wrongChain = wallet.chainId !== null && deploymentChainId != null && wallet.chainId !== deploymentChainId;

  const switchChain = async () => {
    if (!onSwitchChain) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      await onSwitchChain();
    } catch (cause) {
      setSwitchError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSwitching(false);
    }
  };

  if (wallet.account) {
    return (
      <div className="wallet" ref={menuRef}>
        <button
          type="button"
          className={`wallet-button${wrongChain ? ' wallet-button-warn' : ''}`}
          onClick={() => setAccountMenuOpen((o) => !o)}
          title={wrongChain && wallet.chainId !== null ? `Your wallet is on ${chainName(wallet.chainId)}` : undefined}
        >
          <AddressBadge address={wallet.account} asAddress />
        </button>
        {accountMenuOpen && (
          <div className="wallet-menu" role="menu">
            <p className="wallet-menu-note">Connected with {wallet.walletName}</p>
            {wallet.chainId !== null && (
              <p className={`wallet-chain${wrongChain ? ' wallet-chain-warn' : ''}`}>
                <span className="wallet-chain-dot" aria-hidden />
                {chainName(wallet.chainId)}
                {isTestnet(wallet.chainId) && <span className="wallet-chain-tag">testnet</span>}
              </p>
            )}
            {wrongChain && deploymentChainId != null && (
              <>
                <p className="wallet-menu-note">
                  This deployment lives on {chainName(deploymentChainId)}, so nothing here can be signed until your
                  wallet moves there.
                </p>
                {onSwitchChain && (
                  <button
                    type="button"
                    role="menuitem"
                    className="wallet-menu-item wallet-menu-action"
                    onClick={() => void switchChain()}
                    disabled={switching}
                  >
                    {switching ? 'Switching…' : `Switch to ${chainName(deploymentChainId)}`}
                  </button>
                )}
                {switchError && <p className="wallet-menu-note wallet-menu-error">{switchError}</p>}
              </>
            )}
            {registries && (
              <button
                type="button"
                role="menuitem"
                className="wallet-menu-item"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setManaging(true);
                }}
              >
                Registries
              </button>
            )}
            {/* The host holds its own account, so there is no connection here to end - offering it
                would be a control that answers nothing. */}
            {!wallet.hosted && (
              <button
                type="button"
                role="menuitem"
                className="wallet-menu-item"
                onClick={() => {
                  wallet.disconnect();
                  setAccountMenuOpen(false);
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        )}
        {managing && (
          <Modal title="Registries" onClose={() => setManaging(false)} wide>
            <RegistryManager />
          </Modal>
        )}
      </div>
    );
  }

  // In the Circles app the account is the host's Safe. There is nothing here for the reader to
  // connect, so this control only ever reports: the address once the host names it, and that it is
  // waiting until then. Offering browser wallets would send them to install one that cannot sign.
  if (wallet.embedded) {
    return (
      <div className="wallet">
        <span className="wallet-button wallet-waiting">Connecting…</span>
      </div>
    );
  }

  return (
    <div className="wallet" ref={menuRef}>
      <button type="button" className="wallet-button" onClick={() => setPicking((showing) => !showing)}>
        Connect wallet
      </button>
      {picking && (
        <div className="wallet-menu" role="menu">
          {wallet.wallets.length === 0 ? (
            <p className="wallet-menu-note">{NO_WALLET_FOUND}</p>
          ) : (
            wallet.wallets.map((w) => (
              <button
                key={w.info.uuid}
                type="button"
                role="menuitem"
                className="wallet-menu-item"
                // A refused request leaves the list up, so the visitor can try again or take another.
                onClick={() => void wallet.connect(w).then(() => setPicking(false), noop)}
              >
                <img src={w.info.icon} alt="" className="wallet-icon" />
                {w.info.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
