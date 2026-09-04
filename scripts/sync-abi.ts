/**
 * Syncs the app's ABI from the contracts build artifact - the single source of
 * truth. Run after any contract interface change (`just build` in ../contracts
 * first, then `just sync-abi` here).
 */
import { loadArtifact } from './devstack/artifacts';

const CONTRACTS_DIR = new URL('../../contracts', import.meta.url).pathname;

// Every contract the app binds to: the protocol, the factory a creator gets registries from, and the
// allowlist it clones (the Circles registry needs no binding - the app never writes to one).
const CONTRACTS: Array<[file: string, name: string]> = [
  ['Deliberate.sol', 'Deliberate'],
  ['IdentityRegistryFactory.sol', 'IdentityRegistryFactory'],
  ['AllowlistIdentityRegistry.sol', 'AllowlistIdentityRegistry'],
];

for (const [file, name] of CONTRACTS) {
  const target = new URL(`../src/abi/${name}.abi.json`, import.meta.url).pathname;
  const artifact = await loadArtifact(CONTRACTS_DIR, file, name);
  await Bun.write(target, `${JSON.stringify(artifact.abi, null, 1)}\n`);
  console.log(`Wrote ${artifact.abi.length} ABI entries to ${target}`);
}
