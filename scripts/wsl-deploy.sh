#!/usr/bin/env bash
# Build + deploy the token and crowdfund contracts to Stellar testnet,
# initialize both, and print their addresses.
set -euo pipefail
if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_INCREMENTAL=0

# Source contracts dir. Override with SRC=... or run from the repo root.
SRC="${SRC:-$PWD/contracts}"
WORK="$HOME/orange-build"
rm -rf "$WORK"; mkdir -p "$WORK"; cp -r "$SRC/." "$WORK/"
cd "$WORK"
rustup target add wasm32v1-none >/dev/null 2>&1 || true

echo "== build wasms =="
cargo build --workspace --target wasm32v1-none --release 2>&1 | tail -3
TOKEN_WASM="target/wasm32v1-none/release/pledge_token.wasm"
CF_WASM="target/wasm32v1-none/release/crowdfund.wasm"

# Deployer / token-admin / campaign-recipient = the funded orange-admin key.
KEY="${KEY:-orange-admin}"
if ! stellar keys address "$KEY" >/dev/null 2>&1; then
  stellar keys generate "$KEY" --network testnet --fund >/dev/null 2>&1 || true
fi
stellar keys fund "$KEY" --network testnet >/dev/null 2>&1 || true
ADMIN=$(stellar keys address "$KEY")
echo "ADMIN=$ADMIN"

echo "== deploy token =="
TOKEN_ID=$(stellar contract deploy --wasm "$TOKEN_WASM" --source-account "$KEY" --network testnet 2>/dev/null | grep -oE 'C[A-Z2-7]{55}' | head -1)
echo "TOKEN_ID=$TOKEN_ID"
echo "== init token =="
stellar contract invoke --id "$TOKEN_ID" --source-account "$KEY" --network testnet -- \
  initialize --admin "$ADMIN" --decimals 0 --name Pledge --symbol PLG 2>&1 | tail -2

echo "== deploy crowdfund =="
CF_ID=$(stellar contract deploy --wasm "$CF_WASM" --source-account "$KEY" --network testnet 2>/dev/null | grep -oE 'C[A-Z2-7]{55}' | head -1)
echo "CF_ID=$CF_ID"
DEADLINE=$(( $(date +%s) + 2592000 ))   # +30 days
echo "== init crowdfund (goal 5000, +30d) =="
stellar contract invoke --id "$CF_ID" --source-account "$KEY" --network testnet -- \
  initialize --recipient "$ADMIN" --token "$TOKEN_ID" --goal 5000 --deadline "$DEADLINE" 2>&1 | tail -2

echo "RESULT_TOKEN=$TOKEN_ID"
echo "RESULT_CROWDFUND=$CF_ID"
echo "RESULT_ADMIN=$ADMIN"
echo "RESULT_DEADLINE=$DEADLINE"
