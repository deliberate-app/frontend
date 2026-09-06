import { describe, expect, mock, test } from 'bun:test';
import { decodeFunctionData, erc20Abi, getAddress, type Abi } from 'viem';

const sent: { to: string; data?: string; value?: string }[][] = [];
let answer: string[] = ['0xfeed'];

// The host is a page the tests do not run inside, so its one call is stood in for. What is worth
// pinning is the calldata handed to it: the host signs exactly these bytes.
void mock.module('@aboutcircles/miniapp-sdk', () => ({
  isMiniappMode: () => false,
  onWalletChange: () => () => {},
  sendTransactions: (transactions: { to: string; data?: string }[]) => {
    sent.push(transactions);
    return Promise.resolve(answer);
  },
}));

const { miniappSigner } = await import('./signer');

const ACCOUNT = getAddress('0x41612A36e1eB8f74e041c4fEa382a26bd17b55a9');
const TOKEN = getAddress('0x78Bab8D5EA6B72f8375Cc21436857815210F7D02');
const SPENDER = getAddress('0x28b939ed3F67c8eaB198e46E9d41CcB4d19c6DE3');

describe('miniappSigner', () => {
  test('hands the host the call as calldata, and answers with its hash', async () => {
    sent.length = 0;
    answer = ['0xabc123'];
    const signer = miniappSigner(ACCOUNT);

    const hash = await signer.send({
      address: TOKEN,
      abi: erc20Abi as Abi,
      functionName: 'approve',
      args: [SPENDER, 10n],
    });

    expect(hash).toBe('0xabc123');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(1);
    expect(getAddress(sent[0][0].to)).toBe(TOKEN);
    // The host is given bytes, so the test reads them back rather than trusting the shape.
    expect(decodeFunctionData({ abi: erc20Abi, data: sent[0][0].data as `0x${string}` })).toEqual({
      functionName: 'approve',
      args: [SPENDER, 10n],
    });
  });

  test('says so when the host sends nothing back', async () => {
    sent.length = 0;
    answer = [];
    const signer = miniappSigner(ACCOUNT);

    await expect(
      signer.send({ address: TOKEN, abi: erc20Abi as Abi, functionName: 'approve', args: [SPENDER, 1n] }),
    ).rejects.toThrow('did not send');
  });

  test('has no chain to move: the host is on Gnosis and stays there', async () => {
    const signer = miniappSigner(ACCOUNT);
    expect(signer.hosted).toBe(true);
    expect(signer.account).toBe(ACCOUNT);
    // Resolves rather than throwing, so the write path needs no branch of its own.
    await expect(signer.ensureChain({ id: 100 } as never)).resolves.toBeUndefined();
  });
});
