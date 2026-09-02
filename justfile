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

# Start the dev server against the live Gnosis deployment (loads .env.gnosis; copy .env.gnosis.example first)
dev-gnosis:
    bun run dev:gnosis

# Sync the app ABI from the contracts build artifact
sync-abi:
    bun scripts/sync-abi.ts

# Run the unit tests; the lifecycle tests run only with anvil up on 127.0.0.1:8545
test:
    bun test

# Type-check and build for production
build:
    bun run build

# Preview the production build
preview:
    bun run preview

# Build and capture design-review screenshots (browse, thesis, drill-down, mobile).
# The deployment vars are blanked so a stale .env.local (dev-anvil) or .env cannot pull the
# build into contract mode against a dead chain - the tool always shoots the sample debate.
screenshots:
    VITE_DELIBERATE_ADDRESS= VITE_RPC_URL= VITE_INDEXER_URL= bun run build
    bun scripts/screenshot.mjs
