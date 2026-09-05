import { getAddress, isAddress, type Address } from 'viem';

/** Address helpers: the one truncation used everywhere, the identicon pattern, and pasted lists. */

/**
 * Shortens an address to the canonical `0x1234…abcd` form - one style across the whole app,
 * matching the ecosystem convention (Etherscan and the wallets print four hex either side).
 */
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** A deterministic blockies-style identicon: an 8x8 mirrored pattern with three seeded colors. */
export interface Identicon {
  /** Cell values row by row: 0 background, 1 color, 2 spot color. */
  cells: number[];
  color: string;
  bgColor: string;
  spotColor: string;
}

export const IDENTICON_SIZE = 8;

/**
 * Derives the identicon from the address alone (case-insensitive), so the same account renders
 * the same icon everywhere and forever. The generator is the classic blockies scheme: a xorshift
 * PRNG seeded from the address drives three HSL colors and a horizontally mirrored cell pattern.
 */
export function identiconOf(address: string): Identicon {
  const seed = new Int32Array(4);
  const lower = address.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    seed[i % 4] = (seed[i % 4] << 5) - seed[i % 4] + lower.charCodeAt(i);
  }

  const rand = (): number => {
    const t = seed[0] ^ (seed[0] << 11);
    seed[0] = seed[1];
    seed[1] = seed[2];
    seed[2] = seed[3];
    seed[3] = seed[3] ^ (seed[3] >> 19) ^ t ^ (t >> 8);
    return (seed[3] >>> 0) / 0x80000000;
  };

  const color = (): string => {
    const hue = Math.floor(rand() * 360) % 360;
    const saturation = 45 + Math.floor(rand() * 25);
    const lightness = 35 + Math.floor(rand() * 35);
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  };

  const mainColor = color();
  const bgColor = color();
  const spotColor = color();

  const cells: number[] = [];
  for (let row = 0; row < IDENTICON_SIZE; row++) {
    // The left half is random; the right half mirrors it - the symmetry is what makes it a face.
    const half = Array.from({ length: IDENTICON_SIZE / 2 }, () => Math.floor(rand() * 2.3));
    cells.push(...half, ...half.slice().reverse());
  }

  return { cells, color: mainColor, bgColor, spotColor };
}

/** What a pasted list of addresses came to. */
export interface AddressList {
  /** The addresses, checksummed, in the order they were written, with repeats dropped. */
  addresses: Address[];
  /** The words that are not addresses, so a reader can find their typo instead of hunting for it. */
  rejected: string[];
}

/**
 * Reads a pasted list of accounts. New lines, commas, semicolons and spaces all separate one
 * address from the next, because a list arrives from a spreadsheet column as readily as from a
 * chat message, and a reader should not have to reformat it first.
 *
 * A lowercase address is accepted. Wallets and explorers print the checksummed form, but plenty
 * of tools do not, and rejecting a valid account over its capitalisation would be a puzzle rather
 * than a safeguard.
 */
export function parseAddressList(text: string): AddressList {
  const seen = new Set<string>();
  const addresses: Address[] = [];
  const rejected: string[] = [];
  for (const word of text.split(/[\s,;]+/).filter((word) => word !== '')) {
    if (!isAddress(word, { strict: false })) {
      rejected.push(word);
    } else if (!seen.has(word.toLowerCase())) {
      seen.add(word.toLowerCase());
      addresses.push(getAddress(word));
    }
  }
  return { addresses, rejected };
}
