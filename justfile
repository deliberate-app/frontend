# Show commands before running (helps debug failures)
set shell := ["bash", "-euo", "pipefail", "-c"]

# Default recipe
default:
    @just --list

# Install dependencies
install:
    bun install

# Start the dev server against the bundled sample debate
dev:
    bun run dev

# Start anvil, deploy and seed Deliberate from the debate script, then run the dev server against it
dev-anvil:
    bun scripts/dev-anvil.ts

# Start the dev server against the shared testnet (loads .env.testnet; copy .env.testnet.example first)
dev-testnet:
    bun run dev:testnet

# Sync the app ABI from the contracts build artifact
sync-abi:
    bun scripts/sync-abi.ts

# Run the unit tests (includes a kubo round-trip when the node is up)
test:
    bun test

# Type-check and build for production
build:
    bun run build

# Preview the production build
preview:
    bun run preview

# Start the dockerized IPFS node
ipfs-up:
    docker compose up -d ipfs

# Stop the dockerized IPFS node
ipfs-down:
    docker compose down

# Build and capture design-review screenshots (browse, thesis, drill-down, mobile).
# The deployment vars are blanked so a stale .env.local (dev-anvil) or .env cannot pull the
# build into contract mode against a dead chain - the tool always shoots the sample debate.
screenshots:
    VITE_DELIBERATE_ADDRESS= VITE_RPC_URL= VITE_INDEXER_URL= bun run build
    bun scripts/screenshot.mjs
