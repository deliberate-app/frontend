# Deliberate Frontend

A kialo-style viewer for Deliberate debates: the thesis (or any focused argument) on top, its pro and con arguments in two columns, click any card to drill down the tree. The ancestry rail above the focused claim shows the path back to the thesis, with each connector colored by that step's polarity. Above it, a clickable mini tree-view maps the debate around the focus — the thesis in black, pros green, cons red, the current path filled — expanding rows as you drill down and collapsing them as you climb back up.

Every card shows the argument's **market approval** (the pro share of its argument market) and its **weight** (vote tokens staked).

## Develop

```sh
just install     # bun install
just dev         # dev server with the bundled sample debate
just dev-anvil   # local anvil chain: deploy + seed + serve (writes .env.local)
just dev-testnet # the shared Base Sepolia testnet (loads .env.testnet)
just test        # unit tests (bun test); includes a kubo round-trip when the node is up
```

Each `dev-*` recipe selects an environment through Vite's env files: `dev-anvil` writes and uses
`.env.local` (the local anvil deployment); `dev-testnet` runs `vite --mode testnet`, which loads
`.env.testnet` (the shared testnet). Plain `dev` uses `.env`/`.env.local` and, with no address set,
shows the bundled sample. Only the `.env.*.example` templates are committed.

The sample debate is modeled on kialo's ["Should humans act to fight climate change?"](https://www.kialo.com/should-humans-act-to-fight-climate-change-4540).

## Run against a local anvil chain

```sh
just dev-anvil
```

One typed tool ([scripts/dev-anvil.ts](scripts/dev-anvil.ts)) runs the whole stack: it starts anvil (if not already running), builds and deploys Deliberate plus a mock Proof of Humanity, replays the seed **debate script** ([scripts/seed/climateDebate.ts](scripts/seed/climateDebate.ts)) as its four personas — each acting from its own account, joining before its first action — pins the argument texts to IPFS, writes `.env.local`, and starts the dev server. To interact from a wallet, add the network `http://127.0.0.1:8545` (chain id `31337`) and import one of the persona accounts printed by the tool.

Debate scripts are typed data (`DebateScript` in [scripts/devstack/debate.ts](scripts/devstack/debate.ts)): personas plus `add`/`wait`/`stake`/`advancePhase` steps with symbolic argument keys. Editing one file changes the seeded texts, their on-chain digests, and what gets pinned — they cannot drift apart.

## Reading any deployment

Set both variables (in `.env.local` or the environment):

```sh
VITE_DELIBERATE_ADDRESS=0x…   # Deliberate contract address
VITE_RPC_URL=https://…       # JSON-RPC endpoint
VITE_IPFS_GATEWAY=https://ipfs.io   # optional, enables content resolution (gateway is untrusted - reads are digest-verified)
VITE_IPFS_API=https://…      # optional, kubo-compatible RPC API the authoring flow publishes content to
VITE_INDEXER_URL=https://…   # optional, GraphQL endpoint of the debate indexer (../indexer)
```

With `VITE_INDEXER_URL` set, the whole debate loads from the indexer in a single GraphQL
query instead of an RPC traversal of the tree, falling back to chain reads whenever the
indexer is unreachable or has not caught up. `just dev-anvil` writes the variable
automatically when the indexer repo is checked out. Transactions always go through the RPC.

The ABI is synced from `contracts/out/Deliberate.sol/Deliberate.json` into `src/abi/Deliberate.abi.json`
with `just sync-abi` after any contract interface change.

## Base Sepolia

```sh
cp .env.testnet.example .env.testnet   # then edit if needed
just dev-testnet
```

`.env.testnet.example` carries the shared testnet config (the deployed Deliberate address and the
hosted indexer's GraphQL endpoint). Copy it to `.env.testnet` (gitignored, so per-machine tweaks
stay local) and run `just dev-testnet` — Vite's `--mode testnet` loads it, and its values override
any local-anvil `.env.local`, so the two environments never bleed together. The app is
chain-agnostic at runtime; wallets just need the Base Sepolia network (chain 84532).

Content resolution needs a reachable IPFS node. The template defaults to digest-only (a public
gateway can read pre-pinned content but authoring pins nothing), so authored texts won't resolve
elsewhere. To author resolvable content from your machine, run `just ipfs-up` and point both
`VITE_IPFS_GATEWAY` and `VITE_IPFS_API` at the local kubo in your `.env.testnet`; for a truly shared
testnet, point them at a hosted pinning service instead.

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

**Production pinning strategy.** Argument texts are tiny immutable blocks whose digests are public on-chain, so availability has three legs: (1) at authoring time the client publishes to the deployment's `VITE_IPFS_API` — a kubo node or cluster the operator runs behind an origin-restricted, authenticated proxy; (2) any party can audit and re-pin content from the on-chain digests — the event indexer (`../indexer`, `ENVIO_PIN_IPFS_API`) re-pins everything it sees, acting as the availability backstop; (3) the inline-decode fallback keeps short payloads readable with no IPFS at all. Because reads are digest-verified, *any* gateway — public or private — is safe to resolve through; a gateway can at worst withhold content, never forge it.

## Hosting on Vercel

The app deploys as a static Vite build plus one serverless route. Vercel detects Vite from the
repo (installs and builds with bun via `bun.lock`); the hash-based routing needs no rewrites.

Authoring on the hosted site publishes through [api/v0/add.ts](api/v0/add.ts), a kubo-shaped
**pin proxy**: `publishText` sends the same multipart request it would send to a kubo node, the
edge function pins the text on [Pinata](https://pinata.cloud) (free tier) and answers with kubo's
`{Hash}`, and the client's digest assertion keeps holding — a mispinned CID fails loudly. The
Pinata credential never reaches the browser. The route is origin-open like any public API;
the 256 KiB cap bounds abuse, and the client-side digest check bounds damage.

Project environment variables (Settings → Environment Variables):

```sh
VITE_DELIBERATE_ADDRESS=0x…   # the live deployment (contracts/broadcast/…/runWithMockRegistry-latest.json)
VITE_RPC_URL=https://sepolia.base.org
VITE_INDEXER_URL=https://…   # the hosted indexer endpoint; the dev tier mints a new URL per deploy
VITE_IPFS_GATEWAY=https://ipfs.io
VITE_IPFS_API=/              # authoring goes through the same-origin pin proxy
PINATA_JWT=…                 # server-side only (Sensitive): a v3 key scoped to Files: Write
```

`VITE_*` values are baked into the public bundle at build time — they must never hold secrets.
`PINATA_JWT` is read only by the edge function at request time. Local development ignores all of
this: `just dev-testnet` authors against the dockerized kubo, no pinning service involved.

## Wallets

Wallet connection uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) multi-provider discovery via viem, so any announcing browser wallet (MetaMask, Rabby, Coinbase Wallet, …) appears in the connect menu. Once connected against an on-chain deployment, the app is fully interactive ([src/data/actions.ts](src/data/actions.ts)):

- **Join** the debate from the header (the token balance replaces the button once joined).
- **Author arguments** during Editing: a composer beneath each column publishes the text through the content pipeline, then commits the digest with `addArgument`. The author picks the deposit (at least the minimum) — a larger stake deepens the market and gives the argument more starting weight.
- **Rate arguments** during Rating: stake vote tokens on the focused argument being under- or overrated.
- **After the debate**: redeem your shares and claim creator fees from the focused argument, or redeem across every argument you hold at once from the finished-debate banner (`redeemArgumentSharesBatch`, its argumentIds read from the indexer's per-participant positions).

Arguments **finalize automatically** once their editing window elapses — no poke, no transaction: a draft carries a dashed *draft · locks in <countdown>* chip and simply becomes final (tradeable and tallied) when the clock runs out. The contract's **permissionless phase pokes** are surfaced too, so a debate progresses without scripts — any connected account may trigger them, joined or not. When a phase deadline passes, a poke appears next to the phase chip in the header (*Start rating*, *Start tallying*, and in Tallying *Tally the debate*, which computes the outcome and finishes the debate). The app polls the chain every 30 seconds, so newly opened gates and other participants' moves show up on their own.

Every action is simulated before it is sent, so contract rejections (wrong phase, insufficient tokens, …) surface as readable messages without a signature prompt. The action layer is covered by a lifecycle test that drives a fresh deployment end to end against the local anvil (`just test` with the dev stack running).

## Design-review screenshots

```sh
just screenshots   # builds, then captures desktop/drill-down/mobile via Playwright
```

Design tokens and rationale live in [DESIGN.md](./DESIGN.md).
