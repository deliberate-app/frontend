import { useEffect, useRef, useState } from 'react';
import { chainName, isTestnet } from '../lib/chains';
import { type WalletState } from '../wallet/useWallet';
import { AddressBadge } from './AddressBadge';

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
  // Two different menus hang off this control - the account menu once connected, and the picker
  // before that. Only the account menu's openness is local: the picker is opened from elsewhere
  // in the app too (an action that needs a wallet asks for one), so it lives in the wallet state.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const connected = wallet.account !== null;
  const open = connected ? accountMenuOpen : wallet.picking;
  const close = connected ? () => setAccountMenuOpen(false) : wallet.dismissPrompt;

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
  const wrongChain =
    wallet.chainId !== null && deploymentChainId != null && wallet.chainId !== deploymentChainId;

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
                  This deployment lives on {chainName(deploymentChainId)}, so nothing here can be
                  signed until your wallet moves there.
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wallet" ref={menuRef}>
      <button
        type="button"
        className="wallet-button"
        onClick={() => (wallet.picking ? wallet.dismissPrompt() : wallet.promptConnect())}
      >
        Connect wallet
      </button>
      {wallet.picking && (
        <div className="wallet-menu" role="menu">
          {wallet.wallets.length === 0 ? (
            <p className="wallet-menu-note">
              No wallet extensions found. Install MetaMask or another browser wallet, then reload.
            </p>
          ) : (
            wallet.wallets.map((w) => (
              <button
                key={w.info.uuid}
                type="button"
                role="menuitem"
                className="wallet-menu-item"
                onClick={() => void wallet.connect(w)}
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
