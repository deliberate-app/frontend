/** Runs the dockerized kubo node the content pipeline publishes to and resolves from. */

export const KUBO_API_URL = 'http://127.0.0.1:5001';

export const IPFS_GATEWAY_URL = 'http://127.0.0.1:8080';

export async function kuboUp(): Promise<boolean> {
  try {
    return (await fetch(`${KUBO_API_URL}/api/v0/id`, { method: 'POST', signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

/** Starts the compose ipfs service; returns false when docker is unavailable or kubo never gets ready. */
export async function ensureKubo(composeDir: string): Promise<boolean> {
  if (!Bun.which('docker')) {
    return false;
  }
  const up = Bun.spawn(['docker', 'compose', 'up', '-d', 'ipfs'], {
    cwd: composeDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await up.exited) !== 0) {
    return false;
  }
  const deadline = Date.now() + 60_000;
  while (!(await kuboUp())) {
    if (Date.now() > deadline) {
      return false;
    }
    await Bun.sleep(500);
  }
  return true;
}
