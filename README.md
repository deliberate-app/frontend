# ArborVote Frontend

A kialo-style viewer for ArborVote debates: the thesis (or any focused argument) on top, its pro and con arguments in two columns, click any card to drill down the tree. The ancestry rail above the focused claim shows the path back to the thesis, with each connector colored by that step's polarity.

Every card shows the argument's **market approval** (the pro share of its argument market) and its **weight** (vote tokens invested).

## Develop

```sh
just install   # bun install
just dev       # dev server with the bundled sample debate
just test      # unit tests (bun test); includes a kubo round-trip when the node is up
```

The sample debate is modeled on kialo's ["Should humans act to fight climate change?"](https://www.kialo.com/should-humans-act-to-fight-climate-change-4540).

## Run against a local anvil chain

```sh
just dev-anvil
```

One typed tool ([scripts/dev-anvil.ts](scripts/dev-anvil.ts)) runs the whole stack: it starts anvil (if not already running), builds and deploys ArborVote plus a mock Proof of Humanity, replays the seed **debate script** ([scripts/seed/climateDebate.ts](scripts/seed/climateDebate.ts)) as its four personas — each acting from its own account, joining before its first action — pins the argument texts to IPFS, writes `.env.local`, and starts the dev server. To interact from a wallet, add the network `http://127.0.0.1:8545` (chain id `31337`) and import one of the persona accounts printed by the tool.

Debate scripts are typed data (`DebateScript` in [scripts/devstack/debate.ts](scripts/devstack/debate.ts)): personas plus `add`/`wait`/`invest`/`advancePhase` steps with symbolic argument keys. Editing one file changes the seeded texts, their on-chain digests, and what gets pinned — they cannot drift apart.

## Reading any deployment

Set both variables (in `.env.local` or the environment):

```sh
VITE_ARBORVOTE_ADDRESS=0x…   # ArborVote contract address
VITE_RPC_URL=https://…       # JSON-RPC endpoint
VITE_IPFS_GATEWAY=https://ipfs.io   # optional, enables content resolution (gateway is untrusted - reads are digest-verified)
VITE_IPFS_API=https://…      # reserved for the upcoming authoring flow: kubo-compatible RPC API to publish content to
```

The ABI is extracted from `contracts/out/ArborVote.sol/ArborVote.json` into `src/abi/ArborVote.abi.json`.

## Argument content and IPFS

The contract stores each argument's content as a `bytes32` — the **sha-256 multihash digest of an IPFS raw-leaves block**. The content pipeline lives in [src/lib/ipfs.ts](src/lib/ipfs.ts):

- **Publish** (`publishText`): adds and pins the text on a kubo-compatible RPC API (`/api/v0/add?raw-leaves=true&cid-version=1&pin=true`) and returns the digest for on-chain use. The returned CID is asserted to wrap exactly the locally computed digest, so the on-chain reference and the pinned content cannot drift, and content above the single-block limit (256 KiB) is rejected up front — it could never be referenced by one digest. Publish first, then send the transaction: a failed transaction leaves only a harmless pinned text block. Today the publisher is the dev seeding tool; the upcoming authoring flow publishes to `VITE_IPFS_API` before sending `addArgument`.
- **Resolve** (`fetchTextByDigest`): rebuilds the CIDv1 (`b` + base32 of `0x01 0x55 0x12 0x20 + digest`, [src/lib/cid.ts](src/lib/cid.ts)) and fetches the text from `VITE_IPFS_GATEWAY`. **The gateway is untrusted**: responses are size-capped while streaming and must hash back to the on-chain digest, otherwise they are discarded. Without a gateway (or when verification fails), short ASCII payloads are decoded inline and anything else is shown as the raw digest.

A local [kubo](https://github.com/ipfs/kubo) node runs via Docker for a reproducible setup (`docker-compose.yml`, image version pinned). Its RPC API allowlists the dev app origins — never `*`, the Origin check is the unauthenticated API's CSRF defense ([ipfs/container-init.d](ipfs/container-init.d/010-rpc-cors.sh)) — so the authoring flow will work in development without infrastructure changes:

```sh
just ipfs-up     # start the node (gateway on 127.0.0.1:8080, RPC on 127.0.0.1:5001)
just ipfs-down   # stop it
```

`dev-anvil.ts` starts the node, publishes the seed content through the same pipeline, and writes both `VITE_IPFS_GATEWAY` and `VITE_IPFS_API` into `.env.local`.

**Production pinning strategy.** Argument texts are tiny immutable blocks whose digests are public on-chain, so availability has three legs: (1) at authoring time the client publishes to the deployment's `VITE_IPFS_API` — a kubo node or cluster the operator runs behind an origin-restricted, authenticated proxy; (2) any party can audit and re-pin content from the on-chain digests — the planned event indexer re-pins everything it sees, acting as the availability backstop; (3) the inline-decode fallback keeps short payloads readable with no IPFS at all. Because reads are digest-verified, *any* gateway — public or private — is safe to resolve through; a gateway can at worst withhold content, never forge it.

## Wallets

Wallet connection uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) multi-provider discovery via viem, so any announcing browser wallet (MetaMask, Rabby, Coinbase Wallet, …) appears in the connect menu. The connection currently identifies the account; transactions (joining, adding arguments, investing) are the next step.

## Design-review screenshots

```sh
just screenshots   # builds, then captures desktop/drill-down/mobile via Playwright
```

Design tokens and rationale live in [DESIGN.md](./DESIGN.md).
