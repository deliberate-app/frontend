import { createContext, useContext } from 'react';
import { identiconOf, IDENTICON_SIZE, shortAddress } from '../lib/address';

/**
 * The connected account, so a badge can recognise itself without every view between here and the
 * wallet having to carry it. Null while no wallet is connected, which is most of a visitor's time.
 */
export const ViewerAccount = createContext<string | null>(null);

/** The deterministic identicon of an account, sized in em so it rides with its text. */
function IdenticonIcon({ address }: { address: string }) {
  const { cells, color, bgColor, spotColor } = identiconOf(address);
  const palette = [bgColor, color, spotColor];
  return (
    <svg
      className="identicon"
      viewBox={`0 0 ${IDENTICON_SIZE} ${IDENTICON_SIZE}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect width={IDENTICON_SIZE} height={IDENTICON_SIZE} fill={bgColor} />
      {cells.map((cell, i) =>
        cell === 0 ? null : (
          <rect
            key={i}
            x={i % IDENTICON_SIZE}
            y={Math.floor(i / IDENTICON_SIZE)}
            width="1"
            height="1"
            fill={palette[cell]}
          />
        ),
      )}
    </svg>
  );
}

/**
 * The one way an account renders anywhere in the app: its identicon plus the canonical
 * `0x1234…abcd` truncation, or **You** where that account is the one connected. Presentational -
 * interactive wrappers (the copy chip, the wallet button) compose it.
 *
 * "You" keeps the truncation's width (11 monospace characters), so a column of badges stays a
 * column: the identicons line up down the left and whatever follows the name lines up down the
 * right, whether or not one of the rows is yours. The wallet button opts out - its whole job is to
 * say *which* account is connected, and "You" would answer a question nobody asked there.
 */
export function AddressBadge({
  address,
  label,
  asAddress,
}: {
  address: string;
  label?: string;
  /** Render the address even where it is the viewer's own. */
  asAddress?: boolean;
}) {
  const viewer = useContext(ViewerAccount);
  const isViewer = !asAddress && viewer !== null && viewer.toLowerCase() === address.toLowerCase();
  return (
    <span className="address-badge">
      <IdenticonIcon address={address} />
      <span className={`mono ${isViewer ? 'address-viewer' : ''}`}>
        {label ?? (isViewer ? 'You' : shortAddress(address))}
      </span>
    </span>
  );
}
