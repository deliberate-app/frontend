# ArborVote Frontend

A kialo-style viewer for ArborVote debates: the thesis (or any focused argument) on top, its pro and con arguments in two columns, click any card to drill down the tree. The ancestry rail above the focused claim shows the path back to the thesis, with each connector colored by that step's polarity.

Every card shows the argument's **market approval** (the pro share of its argument market) and its **weight** (vote tokens invested).

## Develop

```sh
just install   # bun install
just dev       # dev server with the bundled sample debate
```

The sample debate is modeled on kialo's ["Should humans act to fight climate change?"](https://www.kialo.com/should-humans-act-to-fight-climate-change-4540).

## Run against a local anvil chain

```sh
just dev-anvil
```

This starts anvil (if not already running), deploys ArborVote plus a mock Proof of Humanity via `contracts/script/DeployLocal.s.sol`, seeds a sample debate, writes `.env.local`, and starts the dev server. To interact from a wallet, add the network `http://127.0.0.1:8545` (chain id `31337`) and import anvil's default key printed by the script.

## Reading any deployment

Set both variables (in `.env.local` or the environment):

```sh
VITE_ARBORVOTE_ADDRESS=0x…   # ArborVote proxy address
VITE_RPC_URL=https://…       # JSON-RPC endpoint
VITE_IPFS_GATEWAY=https://ipfs.io   # optional, enables content resolution
```

The ABI is extracted from `contracts/out/ArborVote.sol/ArborVote.json` into `src/abi/ArborVote.abi.json`.

## Argument content and IPFS

The contract stores each argument's content as a `bytes32` — the **sha-256 multihash digest of an IPFS raw-leaves block**. The frontend rebuilds the CIDv1 (`b` + base32 of `0x01 0x55 0x12 0x20 + digest`) and fetches the text from `VITE_IPFS_GATEWAY`. Content pinned with `ipfs add --raw-leaves --cid-version=1` resolves exactly. Without a gateway (or when the fetch fails), short ASCII payloads are decoded inline and anything else is shown as the raw digest.

A local [kubo](https://github.com/ipfs/kubo) node runs via Docker for a reproducible setup (`docker-compose.yml`, image version pinned):

```sh
just ipfs-up     # start the node (gateway on 127.0.0.1:8080, RPC on 127.0.0.1:5001)
just ipfs-down   # stop it
```

`dev-anvil.sh` starts the node and pins the seed content automatically when Docker is available.

## Wallets

Wallet connection uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) multi-provider discovery via viem, so any announcing browser wallet (MetaMask, Rabby, Coinbase Wallet, …) appears in the connect menu. The connection currently identifies the account; transactions (joining, adding arguments, investing) are the next step.

## Design-review screenshots

```sh
just screenshots   # builds, then captures desktop/drill-down/mobile via Playwright
```

Design tokens and rationale live in [DESIGN.md](./DESIGN.md).
