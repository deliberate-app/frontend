import { describe, expect, test } from 'bun:test';
import { getAddress } from 'viem';

import { rowProblem } from './ModifyAllowlist';

const ALICE = getAddress('0x41612a36e1eb8f74e041c4fea382a26bd17b55a9');
const BOB = getAddress('0x0db7c1b1d6db1d1b1c1b1d1b1d1b1d1b1d1b7413');
const onList = new Set([ALICE.toLowerCase()]);

describe('rowProblem', () => {
  test('an empty row is the invitation to write one, not a mistake', () => {
    expect(rowProblem('', onList)).toBeNull();
    expect(rowProblem('   ', onList)).toBeNull();
  });

  test('an account not yet on the list is fine', () => {
    expect(rowProblem(BOB, onList)).toBeNull();
  });

  test('an account already on the list says so, whatever case it was written in', () => {
    expect(rowProblem(ALICE, onList)).toBe('Already on this list.');
    expect(rowProblem(ALICE.toLowerCase(), onList)).toBe('Already on this list.');
    expect(rowProblem(`  ${ALICE}  `, onList)).toBe('Already on this list.');
  });

  test('what is not an address says that first', () => {
    expect(rowProblem('0xnope', onList)).toBe('Not an address.');
  });
});
