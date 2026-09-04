import { describe, expect, test } from 'bun:test';
import { getAddress } from 'viem';

import { parseCirclesProfiles } from './circles';

const GROUP = '0xcf7e538e7dfba5654aa0162d64c68b16ff804e31';

describe('reading the Circles profile service', () => {
  test('keeps an avatar with an address, a name and a known kind, checksumming the address', () => {
    const [avatar] = parseCirclesProfiles([
      { name: 't3 crc safe _5', description: 'test', address: GROUP, CID: 'Qm…', avatarType: 'group' },
    ]);
    expect(avatar).toEqual({
      address: getAddress(GROUP),
      name: 't3 crc safe _5',
      kind: 'group',
      description: 'test',
    });
  });

  test('drops rows the app cannot use rather than failing the whole answer', () => {
    const avatars = parseCirclesProfiles([
      { name: 'no address', avatarType: 'human' },
      { name: '', address: GROUP, avatarType: 'group' },
      { name: 'odd kind', address: GROUP, avatarType: 'robot' },
      { name: 'fine', address: GROUP, avatarType: 'organization' },
    ]);
    expect(avatars.map((avatar) => avatar.name)).toEqual(['fine']);
  });

  test('an answer that is not a list is no avatars', () => {
    expect(parseCirclesProfiles({ error: 'nope' })).toEqual([]);
    expect(parseCirclesProfiles(null)).toEqual([]);
  });
});
