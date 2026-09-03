import { AddressBadge } from './AddressBadge';
import { AddressChip } from './AddressChip';
import { LockChip } from './LockChip';

/**
 * Who made a claim and whether it can still change: the creator, then the lock. In that order
 * because that is the order it happened - someone wrote the argument, and the clock they started
 * runs out on it (principle 11) - and in the same place on a card, on the focused argument and on
 * the thesis alike. The two belong together because they answer one question between them: whose
 * claim this is, and whether it is still theirs to move.
 *
 * A card is itself a button, and an address that copies on click cannot nest inside one - so the
 * card shows the badge and the focused claim, where the address is a control in its own right,
 * shows the chip.
 */
export function Byline({
  locked,
  finalizesIn,
  creator,
  presentational,
}: {
  locked: boolean;
  /** Seconds until the draft locks in; null without a chain clock (sample data). */
  finalizesIn: number | null;
  /** The creator's address; absent from sample data, which names nobody. */
  creator?: string;
  /** Set inside another control, where the address is a badge rather than a copy button. */
  presentational?: boolean;
}) {
  return (
    <span className="byline">
      {creator &&
        (presentational ? (
          <span title={creator}>
            <AddressBadge address={creator} />
          </span>
        ) : (
          <AddressChip address={creator} />
        ))}
      <LockChip locked={locked} finalizesIn={finalizesIn} />
    </span>
  );
}
