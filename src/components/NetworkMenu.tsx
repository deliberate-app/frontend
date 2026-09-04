import { useEffect, useRef, useState } from 'react';
import { deploymentIsTestnet, deploymentLabel, type Deployment } from '../data/config';

/** Remembers whether testnets are listed. A per-browser preference, not part of any shared link. */
const TESTNET_PREFERENCE = 'deliberate.showTestnets';

function storedPreference(): boolean {
  try {
    return window.localStorage.getItem(TESTNET_PREFERENCE) === 'true';
  } catch {
    // Private windows and blocked site data throw on access rather than returning null.
    return false;
  }
}

/**
 * Which network the app is pointed at.
 *
 * Renders nothing when the build offers one network: a picker with a single entry is furniture,
 * and the app spent its whole life so far correctly having no such control.
 *
 * Testnets are behind a toggle rather than listed alongside the real ones. The distinction the
 * toggle draws is the one that matters to somebody about to stake - whether the tokens are real -
 * and mixing a chain where they are with one where they are not, in a list where the only
 * difference is a name, is how a person ends up arguing on the wrong network for a week.
 */
export function NetworkMenu({
  networks,
  selected,
  onSelect,
}: {
  networks: Deployment[];
  selected: Deployment | null;
  /** Switches to a network by slug - the caller decides what that does to the route. */
  onSelect: (slug: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showTestnets, setShowTestnets] = useState(storedPreference);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  if (networks.length < 2 || !selected) {
    return null;
  }

  const mainnets = networks.filter((network) => !deploymentIsTestnet(network));
  const testnets = networks.filter(deploymentIsTestnet);
  // Standing on a testnet forces them visible whatever the preference says - hiding the list the
  // current selection is in would leave no way back to it.
  const listTestnets = showTestnets || deploymentIsTestnet(selected);

  const toggleTestnets = () => {
    const next = !showTestnets;
    setShowTestnets(next);
    try {
      window.localStorage.setItem(TESTNET_PREFERENCE, String(next));
    } catch {
      // A browser that will not store it still honours it for this visit.
    }
  };

  const entry = (network: Deployment) => (
    <button
      key={network.slug ?? 'default'}
      type="button"
      role="menuitemradio"
      aria-checked={network.slug === selected.slug}
      className={`wallet-menu-item${network.slug === selected.slug ? ' network-current' : ''}`}
      onClick={() => {
        onSelect(network.slug);
        setOpen(false);
      }}
    >
      <span className={`network-dot${deploymentIsTestnet(network) ? ' network-dot-testnet' : ''}`} aria-hidden />
      {deploymentLabel(network)}
    </button>
  );

  return (
    <div className="wallet network" ref={menuRef}>
      <button type="button" className="wallet-button network-button" onClick={() => setOpen((o) => !o)}>
        <span className={`network-dot${deploymentIsTestnet(selected) ? ' network-dot-testnet' : ''}`} aria-hidden />
        {deploymentLabel(selected)}
      </button>
      {open && (
        <div className="wallet-menu" role="menu">
          {mainnets.map(entry)}
          {testnets.length > 0 && (
            <>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={listTestnets}
                className="wallet-menu-item network-toggle"
                onClick={toggleTestnets}
                disabled={deploymentIsTestnet(selected)}
                title={deploymentIsTestnet(selected) ? 'You are on a testnet, so they stay listed.' : undefined}
              >
                Testnets
                <span className={`network-switch${listTestnets ? ' network-switch-on' : ''}`} aria-hidden />
              </button>
              {listTestnets && testnets.map(entry)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
