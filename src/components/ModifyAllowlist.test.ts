import { describe, expect, test } from 'bun:test';
import { getAddress } from 'viem';

import { changeSummary, rowProblem } from './ModifyAllowlist';

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

describe('changeSummary', () => {
  test('names one of a thing without its plural', () => {
    expect(changeSummary(1, 0)).toBe('1 addition');
    expect(changeSummary(0, 1)).toBe('1 removal');
  });

  test('names both when a list is reworked in one go', () => {
    expect(changeSummary(2, 3)).toBe('2 additions, 3 removals');
  });

  test('says nothing about a kind of change that is not being made', () => {
    expect(changeSummary(4, 0)).toBe('4 additions');
    expect(changeSummary(0, 0)).toBe('');
  });
});
