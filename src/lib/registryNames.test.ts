import { describe, expect, test } from 'bun:test';

import { nextNames, parseNames } from './registryNames';

const ALICE = '0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9';

describe('nextNames', () => {
  test('keys a name by the lowercase address, whatever case it was given in', () => {
    expect(nextNames({}, ALICE, 'Reviewers')).toEqual({ [ALICE.toLowerCase()]: 'Reviewers' });
  });

  // The stored name is trimmed, which is why a field must keep its own text while it is being
  // typed: reading this value back would swallow a space the moment it was written.
  test('stores a name without its trailing space', () => {
    expect(nextNames({}, ALICE, 'Board ')[ALICE.toLowerCase()]).toBe('Board');
  });

  test('trims the name, and a blank one clears the entry', () => {
    const named = nextNames({}, ALICE, '  Reviewers  ');
    expect(named[ALICE.toLowerCase()]).toBe('Reviewers');
    expect(nextNames(named, ALICE, '   ')).toEqual({});
  });

  test('leaves the other names alone', () => {
    const named = nextNames({ '0xabc': 'Board' }, ALICE, 'Reviewers');
    expect(named['0xabc']).toBe('Board');
  });
});

describe('parseNames', () => {
  test('reads a stored object, lowercasing its keys', () => {
    expect(parseNames(`{"${ALICE}": "Reviewers"}`)).toEqual({ [ALICE.toLowerCase()]: 'Reviewers' });
  });

  test('nothing stored, or stored nonsense, is no names', () => {
    expect(parseNames(null)).toEqual({});
    expect(parseNames('not json')).toEqual({});
    expect(parseNames('[1, 2]')).toEqual({});
    expect(parseNames('{"0xabc": 7}')).toEqual({});
  });
});
