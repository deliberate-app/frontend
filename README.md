# Deliberate Frontend

A kialo-style viewer for Deliberate debates: the thesis (or any focused argument) on top, its pro and con arguments in two columns, click any card to drill down the tree. The ancestry rail above the focused claim shows the path back to the thesis, with each connector colored by that step's polarity. Above it, a clickable mini tree-view maps the debate around the focus — the thesis in black, pros green, cons red, the current path filled — expanding rows as you drill down and collapsing them as you climb back up.

Every card shows the argument's **market approval** (the pro share of its argument market) and its **stake** (vote tokens staked on it).

## Develop

```sh
just install     # bun install
just dev         # dev server with the bundled sample debate
just dev-anvil   # local anvil chain: deploy + seed + serve (writes .env.local)
just dev-gnosis  # the live Gnosis Chain deployment (loads .env.gnosis)
just test        # unit tests (bun test); the lifecycle tests need anvil on 127.0.0.1:8545
```

Each `dev-*` recipe selects an environment through Vite's env files: `dev-anvil` writes and uses
`.env.local` (the local anvil deployment); `dev-gnosis` runs `vite --mode gnosis`, which loads
`.env.gnosis` (the live deployment). Plain `dev` uses `.env`/`.env.local` and, with no address set,
shows the bundled sample. Only the `.env.*.example` templates are committed.

The sample debate is modeled on kialo's ["Should humans act to fight climate change?"](https://www.kialo.com/should-humans-act-to-fight-climate-change-4540).

## Run against a local anvil chain

```sh
just dev-anvil
```

One typed tool ([scripts/dev-anvil.ts](scripts/dev-anvil.ts)) runs the whole stack: it starts anvil (if not already running), builds and deploys Deliberate plus a mock Proof of Humanity, replays the seed **debate script** ([scripts/seed/climateDebate.ts](scripts/seed/climateDebate.ts)) as its four personas — each acting from its own account, joining before its first action — writes `.env.local`, and starts the dev server. To interact from a wallet, add the network `http://127.0.0.1:8545` (chain id `31337`) and import one of the persona accounts printed by the tool.

Debate scripts are typed data (`DebateScript` in [scripts/devstack/debate.ts](scripts/devstack/debate.ts)): personas plus `add`/`wait`/`stake`/`advancePhase` steps with symbolic argument keys. Editing one file changes the seeded texts; the chain publishes them as they are.

## Reading any deployment

Set the address and the RPC endpoint (in `.env.local` or the environment):

```sh
VITE_DELIBERATE_ADDRESS=0x…   # Deliberate contract address
VITE_RPC_URL=https://…       # JSON-RPC endpoint
VITE_INDEXER_URL=https://…   # optional, GraphQL endpoint of the debate indexer (../indexer)
```

With `VITE_INDEXER_URL` set, the whole debate loads from the indexer in a single GraphQL
query instead of an RPC traversal of the tree, falling back to chain reads whenever the
indexer is unreachable or has not caught up. `just dev-anvil` writes the variable
automatically when the indexer repo is checked out. Transactions always go through the RPC.

The ABI is synced from `contracts/out/Deliberate.sol/Deliberate.json` into `src/abi/Deliberate.abi.json`
with `just sync-abi` after any contract interface change.

## Several networks at once

Name the networks in `VITE_CHAINS` and give each one its own variables, suffixed with the slug
uppercased and hyphens turned into underscores:

```sh
VITE_CHAINS=gnosis,chiado                      # slugs, in the order the network menu lists them
VITE_DELIBERATE_ADDRESS_GNOSIS=0x…
VITE_DELIBERATE_ADDRESS_CHIADO=0x…
VITE_RPC_URL_GNOSIS=https://…                  # optional; defaults to the chain's public endpoint
VITE_INDEXER_URL=https://…                     # optional, shared; defaults to /api/graphql
INDEXER_UPSTREAM_URL=https://…                 # server-side, what that proxy route forwards to
```

Known slugs are `mainnet`, `sepolia`, `base`, `base-sepolia`, `gnosis`, `chiado` and `anvil`
([src/data/config.ts](src/data/config.ts)). A slug listed without an address is skipped rather than
offered, so a network can be staged before its contract exists.

Per-chain variables **never** fall back to the unsuffixed ones — a network without its own address
would otherwise silently read the default network's contract.

The selected network lives in the URL: `#/gnosis/debate/5` names the network a link was copied
from, so debate 5 on Gnosis and debate 5 on Chiado cannot be confused. Links written before the
segment existed (`#/debate/5`) resolve to the first network in `VITE_CHAINS`.

Leaving `VITE_CHAINS` unset keeps the single-network build described above: no slug in URLs, no
network menu, and the unsuffixed variables used directly.

## Gnosis Chain

```sh
cp .env.gnosis.example .env.gnosis   # then edit if needed
just dev-gnosis
```

`.env.gnosis.example` carries the live deployment's config (the deployed Deliberate and Circles
registry addresses, and the hosted indexer's GraphQL endpoint). Copy it to `.env.gnosis` (gitignored,
so per-machine tweaks stay local) and run `just dev-gnosis` — Vite's `--mode gnosis` loads it, and its
values override any local-anvil `.env.local`, so the two environments never bleed together. Wallets
need the Gnosis Chain network (chain 100); the wallet menu offers to add and switch to it.

## Argument content

The text of a thesis or argument goes to the chain as it is: `createDebate`, `createArgument` and
`alterArgument` take it as a string of 1 to 256 bytes of UTF-8 and publish it in their events
(`DebateCreated`, `ArgumentCreated`, `ArgumentAltered`). Nothing is stored on-chain and nothing is
content-addressed: the indexer folds the events and serves the text with the rest of the tree, and
the chain source reads the same events with `eth_getLogs`. The bounds
live in [src/lib/content.ts](src/lib/content.ts) and are checked before anything is sent; the
budget beside every composer counts bytes, not characters, because that is what the contract counts.

## Hosting on Vercel

The app deploys as a static Vite build plus one serverless route per network. Vercel detects Vite from the
repo (installs and builds with bun via `bun.lock`); the hash-based routing needs no rewrites.

Indexer reads go through [api/graphql.ts](api/graphql.ts), a same-origin **query proxy** that
forwards to `INDEXER_UPSTREAM_URL`. One route serves every network: the indexer covers each chain the
contract is deployed to and a query names the chain it wants. The envio endpoint is CORS-configured correctly; what made
calling it directly fragile is its rate limit - a refused response carries no CORS headers, so
throttling reached the browser as a missing `Access-Control-Allow-Origin` and dropped the app into
its chain fallback rather than surfacing as what it was. Behind the proxy a throttle arrives as the
429 it is. Responses are deliberately not cached: `waitForIndexerBlock` and the stake modal's market
poll both need reads that are not stale. **Repointing the app at a new indexer deployment is a
change to `INDEXER_UPSTREAM_URL` alone** - the client keeps calling `/api/graphql`.

Project environment variables (Settings → Environment Variables):

```sh
VITE_CHAINS=gnosis           # the networks offered, by slug (see *Several networks at once*)
VITE_DELIBERATE_ADDRESS_GNOSIS=0x… # the live deployment (contracts/broadcast/DeployDeliberate.s.sol/100/run-latest.json)
VITE_CIRCLES_REGISTRY_GNOSIS=0x…   # the any-Circles-human registry (contracts: `just deploy-circles-registry`)
VITE_RPC_URL_GNOSIS=https://rpc.gnosischain.com
                             # indexer reads go through the same-origin query proxy, /api/graphql
INDEXER_UPSTREAM_URL=https://… # server-side only; the hosted indexer endpoint the query
                             # proxy forwards to. The dev tier mints a new URL per deployment, and its id
                             # is envio-internal rather than the git sha - read it from the
                             # deployment page, or with `envio-cloud deployment endpoint
                             # <indexer> <commit> <organisation>`.
```

`VITE_*` values are baked into the public bundle at build time — they must never hold secrets.
The `INDEXER_UPSTREAM_URL` variable is read only by the edge function at request time. Local development ignores all of this: `just dev-gnosis` reads its own `.env.gnosis`.

## Wallets

Wallet connection uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) multi-provider discovery via viem, so any announcing browser wallet (MetaMask, Rabby, Coinbase Wallet, …) appears in the connect menu. An action that needs a wallet opens that menu rather than presenting a disabled control — *Start a debate* opens the composer and the wallet picker together, so the thesis can be written while the wallet is chosen.

The menu names the chain the wallet is on, and says so when that is not the deployment's chain: a wallet on the wrong network fails every write, and until it was shown here that only surfaced as a switch prompt at signing time. *Switch to …* moves it (adding the chain first if the wallet does not know it, EIP-3085). Chain definitions come from viem's registry rather than a local table, so the prompt describes each chain correctly — Gnosis pays gas in xDAI, and a prompt claiming otherwise mislabels every fee the wallet shows afterwards ([src/lib/chains.ts](src/lib/chains.ts)).

Once connected against an on-chain deployment, the app is fully interactive ([src/data/actions.ts](src/data/actions.ts)):

- **Join** the debate from the header (the token balance replaces the button once joined).
- **Author arguments** during Editing: a composer beneath each column sends the text with `createArgument`, and the chain publishes it in the argument's creation event. The author picks the deposit (at least the minimum) — a larger deposit deepens the market and puts more stake behind the argument from the start.
- **Rate arguments** during Rating: stake vote tokens on the focused argument being under- or overrated.
- **After the debate**: redeem your shares and claim creator fees from the focused argument, or redeem across every argument you hold at once from the finished-debate banner (`redeemArgumentSharesBatch`, its argumentIds read from the indexer's per-participant positions).

Arguments **finalize automatically** once their editing window elapses — no poke, no transaction: a draft carries a dashed *draft · locks in <countdown>* chip and simply becomes final (tradeable and tallied) when the clock runs out. The contract's **permissionless phase pokes** are surfaced too, so a debate progresses without scripts — any connected account may trigger them, joined or not. When a phase deadline passes, a poke appears next to the phase chip in the header (*Start rating*, *Start tallying*, and in Tallying *Tally the debate*, which computes the outcome and finishes the debate). The app polls the chain every 30 seconds, so newly opened gates and other participants' moves show up on their own.

Every action is simulated before it is sent, so contract rejections (wrong phase, insufficient tokens, …) surface as readable messages without a signature prompt. The action layer is covered by a lifecycle test that drives a fresh deployment end to end against the local anvil (`just test` with the dev stack running).

## Design-review screenshots

```sh
just screenshots   # builds, then captures desktop/drill-down/mobile via Playwright
```

Design tokens and rationale live in [DESIGN.md](./DESIGN.md).
