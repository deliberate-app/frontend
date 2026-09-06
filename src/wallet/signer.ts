import { sendTransactions } from '@aboutcircles/miniapp-sdk';
import {
  BaseError,
  createWalletClient,
  custom,
  encodeFunctionData,
  type Abi,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
  type WalletClient,
} from 'viem';

/** True when the wallet rejected a switch because it does not know the chain (EIP-3085 code 4902). */
function isUnknownChainError(cause: unknown): boolean {
  if ((cause as { code?: number } | null)?.code === 4902) {
    return true;
  }
  return cause instanceof BaseError && cause.walk((error) => (error as { code?: number }).code === 4902) !== null;
}

/**
 * Switches the wallet to the deployment's chain before transacting - wallets routinely sit on
 * another network, which would otherwise fail every write with a chain mismatch. A chain the
 * wallet does not know is added first (EIP-3085), then switched to.
 */
export async function ensureWalletChain(walletClient: WalletClient, chain: Chain): Promise<void> {
  if ((await walletClient.getChainId()) === chain.id) {
    return;
  }
  try {
    await walletClient.switchChain({ id: chain.id });
  } catch (cause) {
    if (!isUnknownChainError(cause)) {
      throw cause;
    }
    await walletClient.addChain({ chain });
    await walletClient.switchChain({ id: chain.id });
  }
}

/** A contract call, prepared but not yet sent. */
export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: unknown[];
}

/**
 * How a prepared call reaches the chain.
 *
 * The app has two kinds of account and only this differs between them. A browser wallet signs and
 * broadcasts through its own EIP-1193 provider, and the reader may have it on the wrong network. A
 * Circles mini-app host holds the account itself: it takes calldata, pays the gas, and is on Gnosis
 * by construction - it exposes no provider at all, so nothing above this seam may reach for one.
 *
 * Reads never come through here. They go to the deployment's own RPC, which is why the mini-app
 * needs no provider to run the whole app.
 */
export interface Signer {
  account: Address;
  /** Whether the host holds the account, which is what the Circles options are offered against. */
  hosted: boolean;
  /** Puts the account on the deployment's chain, where that is the reader's to move. */
  ensureChain(chain: Chain): Promise<void>;
  /**
   * Sends one call and answers with its hash. `gas` is the limit to sign, which a host that pays
   * the gas itself ignores.
   */
  send(call: ContractCall, gas?: bigint): Promise<Hex>;
}

/**
 * A browser wallet, which signs the call and pays for it.
 *
 * Switching chains is asked of the wallet, adding the chain first where the wallet does not know it
 * - a wallet on the wrong network reverts every write against a contract that is not there.
 */
export function walletSigner(provider: EIP1193Provider, account: Address): Signer {
  const client = createWalletClient({ account, transport: custom(provider) });
  return {
    account,
    hosted: false,
    ensureChain: (chain) => ensureWalletChain(client, chain),
    // `chain: null` signs against whatever the wallet is on, which `ensureChain` has just settled.
    // The gas limit travels with the call, so the wallet signs it as sent rather than estimating anew.
    send: (call, gas) => client.writeContract({ ...call, account, chain: null, gas }),
  };
}

/**
 * The Circles mini-app host, which holds the account and pays the gas.
 *
 * The host takes plain calldata and answers with the hash of the transaction it sent. It is on
 * Gnosis Chain and cannot be moved, so there is no chain to ensure; and it sets its own gas, so the
 * limit computed for a wallet is not passed on.
 */
export function miniappSigner(account: Address): Signer {
  return {
    account,
    hosted: true,
    ensureChain: async () => {},
    send: async (call) => {
      const [hash] = await sendTransactions([
        {
          to: call.address,
          data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }),
        },
      ]);
      if (hash === undefined) {
        throw new Error('The Circles app did not send the transaction.');
      }
      return hash as Hex;
    },
  };
}
