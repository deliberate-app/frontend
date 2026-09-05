import { describe, expect, test } from 'bun:test';
import { getAddress } from 'viem';
import {
  IDENTICON_SIZE,
  identiconOf,
  looksLikeAddress,
  parseAddressList,
  shortAddress,
  writeAddressRow,
} from './address';

const ADDRESS = '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9';

describe('shortAddress', () => {
  test('truncates to the ecosystem-standard 0x1234…abcd form', () => {
    expect(shortAddress(ADDRESS)).toBe('0x4161…55a9');
  });
});

describe('identiconOf', () => {
  test('is deterministic and case-insensitive - one account, one icon, everywhere', () => {
    const icon = identiconOf(ADDRESS);
    expect(identiconOf(ADDRESS)).toEqual(icon);
    expect(identiconOf(ADDRESS.toLowerCase())).toEqual(icon);
  });

  test('differs between accounts', () => {
    const other = identiconOf('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(other.cells).not.toEqual(identiconOf(ADDRESS).cells);
  });

  test('is a full mirrored grid of background, color, and spot cells', () => {
    const { cells } = identiconOf(ADDRESS);
    expect(cells).toHaveLength(IDENTICON_SIZE * IDENTICON_SIZE);
    expect(cells.every((cell) => cell === 0 || cell === 1 || cell === 2)).toBe(true);
    for (let row = 0; row < IDENTICON_SIZE; row++) {
      const cellsOfRow = cells.slice(row * IDENTICON_SIZE, (row + 1) * IDENTICON_SIZE);
      expect(cellsOfRow).toEqual(cellsOfRow.slice().reverse());
    }
  });
});

describe('parseAddressList', () => {
  const ALICE = getAddress('0x41612a36e1eb8f74e041c4fea382a26bd17b55a9');
  const BOB = getAddress('0x0db7c1b1d6db1d1b1c1b1d1b1d1b1d1b1d1b7413');

  test('takes new lines, commas, semicolons and spaces as the same separator', () => {
    const { addresses, rejected } = parseAddressList(`${ALICE}\n${BOB}, ${ALICE.toLowerCase()};`);
    expect(addresses).toEqual([ALICE, BOB]);
    expect(rejected).toEqual([]);
  });

  test('accepts a lowercase address and answers with the checksummed form', () => {
    expect(parseAddressList(ALICE.toLowerCase()).addresses).toEqual([ALICE]);
  });

  test('keeps what is not an address, so the reader can find the typo', () => {
    const { addresses, rejected } = parseAddressList(`${ALICE} 0xnope alice.eth`);
    expect(addresses).toEqual([ALICE]);
    expect(rejected).toEqual(['0xnope', 'alice.eth']);
  });

  test('an empty paste is an empty list', () => {
    expect(parseAddressList('   \n ')).toEqual({ addresses: [], rejected: [] });
  });
});

describe('looksLikeAddress', () => {
  test('accepts an address whatever its capitalisation, and trims what surrounds it', () => {
    expect(looksLikeAddress('0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9')).toBe(true);
    expect(looksLikeAddress('  0x41612a36e1eb8f74e041c4fea382a26bd17b55a9 ')).toBe(true);
  });

  test('rejects what is not one', () => {
    expect(looksLikeAddress('')).toBe(false);
    expect(looksLikeAddress('0xnope')).toBe(false);
    expect(looksLikeAddress('alice.eth')).toBe(false);
  });
});

describe('writeAddressRow', () => {
  const ALICE = getAddress('0x41612a36e1eb8f74e041c4fea382a26bd17b55a9');
  const BOB = getAddress('0x0db7c1b1d6db1d1b1c1b1d1b1d1b1d1b1d1b7413');

  test('a half-written address stays in its row, with no row opened after it', () => {
    expect(writeAddressRow([''], 0, '0x416')).toEqual(['0x416']);
  });

  test('a finished address opens an empty row after it', () => {
    expect(writeAddressRow([''], 0, ALICE)).toEqual([ALICE, '']);
  });

  test('a pasted list spreads over a row each, and opens one more', () => {
    expect(writeAddressRow([''], 0, `${ALICE}, ${BOB}`)).toEqual([ALICE, BOB, '']);
  });

  test('a paste into a row in the middle leaves the rows around it alone', () => {
    // The trailing empty row is restored too: the last row reads as an address, so one opens after it.
    expect(writeAddressRow([ALICE, '', BOB], 1, `${BOB} ${ALICE}`)).toEqual([ALICE, BOB, ALICE, BOB, '']);
  });

  test('what is not an address still gets its own row, so the reader sees which one is wrong', () => {
    expect(writeAddressRow([''], 0, `${ALICE} 0xnope`)).toEqual([ALICE, '0xnope']);
  });

  test('clearing a row leaves it in place rather than shifting the rows under the cursor', () => {
    expect(writeAddressRow([ALICE, BOB, ''], 0, '')).toEqual(['', BOB, '']);
  });
});
