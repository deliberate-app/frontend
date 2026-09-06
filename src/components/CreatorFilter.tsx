import { getAddress } from 'viem';
import { looksLikeAddress } from '../lib/address';
import { useCirclesAvatarSearch } from '../lib/circles';
import { useHostedAccount } from '../wallet/hostedAccount';
import { AddressBadge } from './AddressBadge';
import { PickRow } from './Choice';

/**
 * Which creator's debates to show.
 *
 * An address is a poor thing to type, so inside the Gnosis App the field takes a Circles name as
 * well and offers the avatars it matches - the same search, drawn the same way, as the one that
 * anchors a Circles registry.
 *
 * Once an account is settled on, the field gives way to the account itself, drawn as it is drawn
 * everywhere else. That is not only tidier: the filter matches on the address, so a field showing a
 * name would be showing something other than what it filters by, and the first edit would quietly
 * match nothing.
 */
export function CreatorFilter({
  value,
  onChange,
  account,
}: {
  value: string;
  onChange: (author: string) => void;
  /** The connected account, enabling the "mine" shortcut. */
  account?: string;
}) {
  const inCirclesApp = useHostedAccount();
  // Trimmed for both, because the guard trims and `getAddress` does not: a pasted address with a
  // space around it would otherwise pass the test and throw while rendering.
  const written = value.trim();
  const chosen = looksLikeAddress(written) ? getAddress(written) : undefined;

  const found = useCirclesAvatarSearch(written, inCirclesApp && chosen === undefined);

  return (
    <label className="filter filter-author">
      Creator
      {chosen ? (
        <span className="author-chosen">
          <AddressBadge address={chosen} />
          <button type="button" className="author-clear" title="Show all creators" onClick={() => onChange('')}>
            ×
          </button>
        </span>
      ) : (
        <span className="author-field">
          <input
            type="text"
            value={value}
            placeholder={inCirclesApp ? 'Name or 0x…' : '0x…'}
            onChange={(event) => onChange(event.target.value)}
          />
          {/* The mine shortcut lives inside the field it fills. */}
          {account && (
            <button type="button" className="author-mine" title="Only my debates" onClick={() => onChange(account)}>
              mine
            </button>
          )}
        </span>
      )}
      {found !== null && found.length > 0 && (
        <div className="pick-list pick-list-scroll">
          {found.map((avatar) => (
            <PickRow
              key={avatar.address}
              kind={avatar.kind}
              label={avatar.name}
              address={avatar.address}
              onChoose={() => onChange(avatar.address)}
            />
          ))}
        </div>
      )}
    </label>
  );
}
