import { createContext, memo, useContext } from 'react';
import { identiconOf, IDENTICON_SIZE, shortAddress } from '../lib/address';
import { useCirclesIdentity } from '../lib/circles';
import { useHostedAccount } from '../wallet/hostedAccount';

/**
 * The connected account, so a badge can recognise itself without every view between here and the
 * wallet having to carry it. Null while no wallet is connected, which is most of a visitor's time.
 */
export const ViewerAccount = createContext<string | null>(null);

/**
 * The deterministic identicon of an account, sized in em so it rides with its text. Memoised
 * because it draws up to 64 rects from a seeded pattern, and a list of accounts re-renders on every
 * keystroke beside it.
 *
 * Exported for the one place that shows an account before it has a badge: the field an address is
 * being written into, where the icon appears as soon as the text is an address.
 */
export const IdenticonIcon = memo(function IdenticonIcon({ address }: { address: string }) {
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
});

/**
 * The face of an account, in the one size every list draws it at: the Circles picture where there
 * is one, and the address' own identicon otherwise.
 *
 * The picture is passed in rather than looked up here, so a badge that has already asked for the
 * account's Circles identity does not ask a second time for its face.
 */
export function AccountIcon({ address, picture }: { address: string; picture?: string }) {
  return picture ? <img className="identicon" src={picture} alt="" /> : <IdenticonIcon address={address} />;
}

/**
 * The one way an account renders anywhere in the app: its identicon plus the canonical
 * `0x1234…abcd` truncation, marked **(You)** where that account is the one connected.
 * Presentational - interactive wrappers (the copy chip, the wallet button) compose it.
 *
 * The marker follows the address instead of replacing it, so every row still names an account a
 * reader can read, copy and look up. The wallet button opts out - its whole job is to say *which*
 * account is connected, and the marker would answer a question nobody asked there.
 */
export function AddressBadge({
  address,
  label,
  asAddress,
  full,
}: {
  address: string;
  label?: string;
  /** Leave the marker off where the address is already known to be the viewer's own. */
  asAddress?: boolean;
  /** Print the whole address, where the row has room and the reader is checking it. */
  full?: boolean;
}) {
  const viewer = useContext(ViewerAccount);
  const isViewer = !asAddress && viewer !== null && viewer.toLowerCase() === address.toLowerCase();
  // Inside the Gnosis App the reader knows people by their Circles profile, so an account they
  // could recognise is drawn as itself. Only there, and only for an account Circles knows: an
  // address Circles has never heard of is still an address, wherever it is read.
  const circles = useCirclesIdentity(address, useHostedAccount());
  const named = circles.name !== undefined && label === undefined && !full;
  return (
    <span className="address-badge">
      <AccountIcon address={address} picture={circles.picture} />
      <span className={named ? 'circles-name' : `mono ${full ? 'address-full' : ''}`}>
        {named ? circles.name : (label ?? (full ? address : shortAddress(address)))}
      </span>
      {isViewer && <span className="address-viewer">(You)</span>}
    </span>
  );
}
