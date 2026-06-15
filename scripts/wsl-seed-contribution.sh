#!/usr/bin/env bash
# Seed one real cross-contract contribution on testnet so the campaign has
# on-chain activity and a verifiable inter-contract transaction hash.
#   1. faucet: mint demo PLEDGE to the signer (permissionless)
#   2. contribute: crowdfund pulls tokens from the signer via a cross-contract
#      token.transfer into the campaign escrow.
set -euo pipefail
if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
export PATH="$HOME/.cargo/bin:$PATH"

TOKEN_ID="CAMI57EGDROSD4OD2RAMLGZUFYWCWWGPSCCBFHSH23L63HTRFJWLFHFR"
CF_ID="CB6HO45ESN7WPOB3WNQNYYM7OHTV6UDWWCQRS7TLSIADHBZD4AC4DS7V"
AMOUNT="${1:-1500}"
KEY="ofbacker"

# A contribution may come from any account; generate + friendbot-fund a backer.
if ! stellar keys address "$KEY" >/dev/null 2>&1; then
  stellar keys generate "$KEY" --network testnet --fund >/dev/null 2>&1 || true
fi
stellar keys fund "$KEY" --network testnet >/dev/null 2>&1 || true
ADDR=$(stellar keys address "$KEY")
echo "SIGNER=$ADDR"

echo "== faucet (1000 PLG/call, twice) =="
stellar contract invoke --id "$TOKEN_ID" --source-account "$KEY" --network testnet -- \
  faucet --to "$ADDR" 2>&1 | tail -1
stellar contract invoke --id "$TOKEN_ID" --source-account "$KEY" --network testnet -- \
  faucet --to "$ADDR" 2>&1 | tail -1

echo "== balance =="
stellar contract invoke --id "$TOKEN_ID" --source-account "$KEY" --network testnet -- \
  balance --id "$ADDR" 2>&1 | tail -1

echo "== contribute $AMOUNT (cross-contract transfer) =="
stellar contract invoke --id "$CF_ID" --source-account "$KEY" --network testnet -- \
  contribute --from "$ADDR" --amount "$AMOUNT" 2>&1 | tee /tmp/contrib.log | tail -3
echo "---"
echo "TX_URL=$(grep -oE 'https://stellar\.expert[^ ]*tx/[a-f0-9]{64}' /tmp/contrib.log | head -1)"
echo "TX_HASH=$(grep -oiE '[a-f0-9]{64}' /tmp/contrib.log | head -1)"

echo "== raised after =="
stellar contract invoke --id "$CF_ID" --source-account "$KEY" --network testnet -- \
  get_raised 2>&1 | tail -1
