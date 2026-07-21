/**
 * The local dev stack as one typed tool (ADR-0004): ensures anvil and the dockerized kubo
 * node are running, builds and deploys the contracts, replays the seed debate script as
 * its participants, pins the argument texts to IPFS, writes .env.local, and starts the
 * dev server.
 *
 * anvil runs as a host binary on purpose - it ships with the foundry toolchain that
 * builds the contracts, so both are always the same version; kubo stays dockerized
 * (pinned in docker-compose.yml) because nothing else needs IPFS on the host.
 */

import type { Hex } from 'viem';

import { contentURIOf, publishText } from '../src/lib/ipfs';
import { ensureAnvil } from './devstack/anvil';
import { forgeBuild, loadArtifact, type Artifact } from './devstack/artifacts';
import { anvilAccount, devChainClient, runDebateScript } from './devstack/debate';
import { ensureKubo, IPFS_GATEWAY_URL, KUBO_API_URL } from './devstack/ipfs';
import { climateDebate } from './seed/climateDebate';

const RPC_URL = 'http://127.0.0.1:8545';
const VITE_PORT = 5173;
// Hasura of the sibling indexer's dev stack (`just dev` in ../indexer).
const INDEXER_GRAPHQL_URL = 'http://localhost:8090/v1/graphql';

const frontendDir = new URL('..', import.meta.url).pathname;
const contractsDir = new URL('../../contracts', import.meta.url).pathname;
const indexerDir = new URL('../../indexer', import.meta.url).pathname;

const log = (line: string) => console.log(`[dev-anvil] ${line}`);

/**
 * Hands the deployment over to the sibling indexer repo: upserts the given keys
 * into indexer/.env, which envio interpolates into its config. This keeps the
 * index pointed at the newest deployment even when a reused anvil moves the
 * contract to a fresh nonce. A no-op when the indexer repo is not checked out.
 */
async function upsertIndexerEnv(entries: Record<string, string>): Promise<boolean> {
  if (!(await Bun.file(`${indexerDir}/package.json`).exists())) {
    return false;
  }
  const envFile = Bun.file(`${indexerDir}/.env`);
  const lines = ((await envFile.exists()) ? await envFile.text() : '').split('\n');
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${value}`;
    const existing = lines.findIndex((candidate) => candidate.startsWith(`${key}=`));
    if (existing >= 0) {
      lines[existing] = line;
    } else {
      lines.push(line);
    }
  }
  await Bun.write(envFile, lines.join('\n').trimEnd() + '\n');
  return true;
}

/** Whether something (usually an earlier dev server) already listens on the port. */
function portInUse(port: number): boolean {
  for (const hostname of ['::1', '127.0.0.1']) {
    try {
      Bun.listen({ hostname, port, socket: { data() {} } }).stop(true);
    } catch {
      return true;
    }
  }
  return false;
}

const anvil = await ensureAnvil(RPC_URL);
log(anvil.selfStarted ? 'anvil started' : `reusing the anvil already running at ${RPC_URL}`);

try {
  await forgeBuild(contractsDir);

  const client = devChainClient(RPC_URL);
  const deployer = anvilAccount(0);

  const deploy = async (artifact: Artifact, args: unknown[]): Promise<`0x${string}`> => {
    const hash = await client.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args,
      account: deployer,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) {
      throw new Error('deployment produced no contract address');
    }
    return receipt.contractAddress;
  };

  const mockPoh = await deploy(await loadArtifact(contractsDir, 'MockIdentityRegistry.m.sol', 'MockIdentityRegistry'), []);
  const deliberateArtifact = await loadArtifact(contractsDir, 'Deliberate.sol', 'Deliberate');
  const deliberate = await deploy(deliberateArtifact, [mockPoh]);
  log(`Deliberate deployed at ${deliberate} (mock Proof of Humanity at ${mockPoh})`);

  const ipfsAvailable = await ensureKubo(frontendDir);
  if (!ipfsAvailable) {
    log('docker/kubo unavailable - argument content will show as raw digests');
  }

  /** Publishes (pins) the text and returns its on-chain contentURI; hash-only without kubo. */
  const contentURI = async (text: string): Promise<Hex> =>
    ipfsAvailable ? (await publishText(KUBO_API_URL, text)).digest : contentURIOf(text);

  const { debateId, personas } = await runDebateScript(climateDebate, {
    client,
    deliberate,
    abi: deliberateArtifact.abi,
    contentURI,
    log,
  });

  const indexerNotified = await upsertIndexerEnv({
    ENVIO_DELIBERATE_ADDRESS: deliberate,
    ...(ipfsAvailable ? { ENVIO_PIN_IPFS_API: KUBO_API_URL } : {}),
  });
  if (indexerNotified) {
    log('indexer/.env updated - `just dev` in ../indexer (re)indexes this deployment');
  }

  const env = [
    `VITE_DELIBERATE_ADDRESS=${deliberate}`,
    `VITE_RPC_URL=${RPC_URL}`,
    ...(ipfsAvailable ? [`VITE_IPFS_GATEWAY=${IPFS_GATEWAY_URL}`, `VITE_IPFS_API=${KUBO_API_URL}`] : []),
    // The app reads from the index when it is up and falls back to the chain when not.
    ...(indexerNotified ? [`VITE_INDEXER_URL=${INDEXER_GRAPHQL_URL}`] : []),
  ];
  await Bun.write(`${frontendDir}.env.local`, env.join('\n') + '\n');
  log(`.env.local written for debate ${debateId}`);

  log('personas (accounts from the anvil dev mnemonic, in derivation order):');
  for (const [name, account] of personas) {
    log(`  ${name}: ${account.address}`);
  }
  log(`wallet setup: add network ${RPC_URL} (chain id 31337) and import an account above`);

  // A dev server from an earlier run restarts itself when .env.local changes, so it
  // already serves this deployment - a second vite would silently bind another port
  // and leave two UIs on different contracts (exactly the confusion this prevents).
  // Exit without the finally: the stack (chain + restarted dev server) stays up.
  if (portInUse(VITE_PORT)) {
    log(`a dev server is already running on port ${VITE_PORT} and has picked up the new deployment - not starting another`);
    process.exit(0);
  }

  // Bun auto-loaded the PREVIOUS .env.local into process.env when this tool started, and
  // OS environment variables take precedence over env files in vite - scrub them so the
  // dev server reads the freshly written file instead of last run's values.
  const viteEnv: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(viteEnv)) {
    if (key.startsWith('VITE_')) {
      delete viteEnv[key];
    }
  }
  const vite = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: frontendDir,
    env: viteEnv,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });
  process.on('SIGINT', () => vite.kill());
  process.on('SIGTERM', () => vite.kill());
  await vite.exited;
} finally {
  anvil.stop();
}
