import { describe, expect, test } from 'bun:test';

import { deploymentFor, deploymentIsTestnet, deploymentLabel, type Deployment } from './config';

const network = (slug: string | null, chainId: number | null): Deployment => ({
  slug,
  chainId,
  address: '0x00000000000000000000000000000000000000ff',
  rpcUrl: 'https://rpc.example',
});

const GNOSIS = network('gnosis', 100);
const CHIADO = network('chiado', 10200);
const BASE_SEPOLIA = network('base-sepolia', 84532);

describe('resolving the network a route names', () => {
  test('picks the network by slug', () => {
    expect(deploymentFor('chiado', [GNOSIS, CHIADO, BASE_SEPOLIA])).toBe(CHIADO);
  });

  test('a route with no slug is the first configured network', () => {
    // This is what keeps `#/debate/4` working after networks were named: the links that predate
    // the segment resolve to the network listed first, which is where they were written.
    expect(deploymentFor(null, [GNOSIS, CHIADO])).toBe(GNOSIS);
  });

  test('an unknown slug lands on a real network rather than an error', () => {
    // A retired network, or a link from a build configured differently. Showing the default beats
    // a blank page, and the menu then says plainly which network is actually being shown.
    expect(deploymentFor('optimism', [GNOSIS, CHIADO])).toBe(GNOSIS);
  });

  test('no configured network at all is the sample-debate build', () => {
    expect(deploymentFor('gnosis', [])).toBeNull();
    expect(deploymentFor(null, [])).toBeNull();
  });
});

describe('labelling a network', () => {
  test('names it by its chain', () => {
    expect(deploymentLabel(GNOSIS)).toBe('Gnosis');
    expect(deploymentLabel(BASE_SEPOLIA)).toBe('Base Sepolia');
  });

  test('a legacy single-network build has no chain to name', () => {
    expect(deploymentLabel(network(null, null))).toBe('Network');
  });

  test('groups play money apart from real money', () => {
    expect(deploymentIsTestnet(BASE_SEPOLIA)).toBe(true);
    expect(deploymentIsTestnet(CHIADO)).toBe(true);
    expect(deploymentIsTestnet(GNOSIS)).toBe(false);
    // Unknown means unknown: a legacy build is not quietly filed under testnets.
    expect(deploymentIsTestnet(network(null, null))).toBe(false);
  });
});
