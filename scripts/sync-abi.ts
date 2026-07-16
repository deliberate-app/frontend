/**
 * Syncs the app's ABI from the contracts build artifact - the single source of
 * truth. Run after any contract interface change (`just build` in ../contracts
 * first, then `just sync-abi` here).
 */
import { loadArtifact } from './devstack/artifacts';

const CONTRACTS_DIR = new URL('../../contracts', import.meta.url).pathname;
const TARGET = new URL('../src/abi/Deliberate.abi.json', import.meta.url).pathname;

const artifact = await loadArtifact(CONTRACTS_DIR, 'Deliberate.sol', 'Deliberate');
await Bun.write(TARGET, `${JSON.stringify(artifact.abi, null, 1)}\n`);
console.log(`Wrote ${artifact.abi.length} ABI entries to ${TARGET}`);
