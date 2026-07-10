#!/usr/bin/env bash
# Runs the frontend against a local anvil chain with a freshly deployed, seeded ArborVote.
set -euo pipefail

cd "$(dirname "$0")/.."
CONTRACTS_DIR="../contracts"
RPC_URL="http://127.0.0.1:8545"
# anvil's default account #0 (publicly known key, local use only)
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

if ! curl -sf -o /dev/null -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL"; then
  echo "Starting anvil..."
  anvil --silent &
  ANVIL_PID=$!
  trap 'kill "$ANVIL_PID" 2>/dev/null' EXIT
  until curl -sf -o /dev/null -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL"; do
    sleep 0.2
  done
fi

echo "Deploying ArborVote + seeded debate..."
(cd "$CONTRACTS_DIR" && forge script script/DeployLocal.s.sol:DeployLocal \
  --broadcast --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY")

ADDRESS=$(bun -e "const j = await Bun.file('$CONTRACTS_DIR/broadcast/DeployLocal.s.sol/31337/run-latest.json').json(); console.log(j.returns.arborVote.value)")

# Child arguments require finalized parents, and finalization unlocks one time unit
# (1 hour) after creation - warp between seeding levels.
warp() {
  cast rpc evm_increaseTime 3601 --rpc-url "$RPC_URL" >/dev/null
  cast rpc evm_mine --rpc-url "$RPC_URL" >/dev/null
}

echo "Seeding deeper argument levels..."
warp
(cd "$CONTRACTS_DIR" && forge script script/SeedLocal.s.sol:SeedLocal \
  --sig "level2(address)" "$ADDRESS" --broadcast --rpc-url "$RPC_URL")
warp
(cd "$CONTRACTS_DIR" && forge script script/SeedLocal.s.sol:SeedLocal \
  --sig "level3(address)" "$ADDRESS" --broadcast --rpc-url "$RPC_URL")

cat > .env.local <<EOF
VITE_ARBORVOTE_ADDRESS=$ADDRESS
VITE_RPC_URL=$RPC_URL
EOF

# The on-chain contentURIs are sha-256 digests of the seed strings (see DeployLocal.s.sol).
# Pin the same strings to the dockerized kubo node so the frontend can resolve them.
# Keep this list in sync with DeployLocal.s.sol.
if command -v docker >/dev/null 2>&1; then
  echo "Starting the IPFS node (docker compose)..."
  docker compose up -d ipfs
  until docker compose exec -T ipfs ipfs id >/dev/null 2>&1; do sleep 1; done

  echo "Pinning seed content..."
  # Extract every _toIpfsCid("...") string from the seed scripts so the pinned
  # content can never drift out of sync with what was hashed on-chain.
  perl -0777 -ne 'while (/_toIpfsCid\(\s*"([^"]+)"/g) { print "$1\n" }' \
    "$CONTRACTS_DIR/script/DeployLocal.s.sol" "$CONTRACTS_DIR/script/SeedLocal.s.sol" |
    while IFS= read -r seed; do
      printf '%s' "$seed" | docker compose exec -T ipfs ipfs add --quiet --raw-leaves --cid-version=1 >/dev/null
    done
  echo "VITE_IPFS_GATEWAY=http://127.0.0.1:8080" >> .env.local
else
  echo "Docker not found - argument content will show as raw digests."
fi

echo "ArborVote deployed at $ADDRESS"
echo "Wallet setup: add network http://127.0.0.1:8545 (chain id 31337) and import the anvil key above."
bun run dev
