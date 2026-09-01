import { describe, expect, test } from 'bun:test';

import { hashFor, routeFromHash } from './route';

describe('reading a route', () => {
  test('a bare route is the default network browsing', () => {
    expect(routeFromHash('')).toEqual({ slug: null, debateId: null });
    expect(routeFromHash('#/')).toEqual({ slug: null, debateId: null });
    expect(routeFromHash('#')).toEqual({ slug: null, debateId: null });
  });

  test('links written before networks were named still open their debate', () => {
    // deliberate.garden/#/debate/4 is in the docs, in chat histories and in people's bookmarks.
    // Breaking those to add a URL segment would be paying for the feature with the archive.
    expect(routeFromHash('#/debate/4')).toEqual({ slug: null, debateId: 4 });
  });

  test('a named network carries into both the browse home and a debate', () => {
    expect(routeFromHash('#/gnosis')).toEqual({ slug: 'gnosis', debateId: null });
    expect(routeFromHash('#/gnosis/')).toEqual({ slug: 'gnosis', debateId: null });
    expect(routeFromHash('#/base-sepolia/debate/12')).toEqual({ slug: 'base-sepolia', debateId: 12 });
  });

  test('"debate" is a path segment, never a network name', () => {
    // The one ambiguity in the scheme: without this the first segment of `#/debate/4` would read
    // as a network called "debate", and the debate id would be lost.
    expect(routeFromHash('#/debate/4').slug).toBeNull();
  });

  test('a malformed tail browses rather than erroring', () => {
    expect(routeFromHash('#/gnosis/debate/abc')).toEqual({ slug: 'gnosis', debateId: null });
    expect(routeFromHash('#/gnosis/debate')).toEqual({ slug: 'gnosis', debateId: null });
    expect(routeFromHash('#/gnosis/nonsense')).toEqual({ slug: 'gnosis', debateId: null });
  });
});

describe('writing a route', () => {
  test('round-trips every shape the app can be in', () => {
    for (const [slug, debateId] of [
      [null, null],
      [null, 4],
      ['gnosis', null],
      ['base-sepolia', 12],
    ] as const) {
      expect(routeFromHash(hashFor(slug, debateId))).toEqual({ slug, debateId });
    }
  });

  test('the default network writes the URLs it always wrote', () => {
    expect(hashFor(null, null)).toBe('#/');
    expect(hashFor(null, 4)).toBe('#/debate/4');
  });

  test('a named network is the first segment', () => {
    expect(hashFor('gnosis', null)).toBe('#/gnosis');
    expect(hashFor('gnosis', 4)).toBe('#/gnosis/debate/4');
  });
});
