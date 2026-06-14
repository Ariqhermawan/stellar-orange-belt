#!/usr/bin/env bash
# Build + test the token + crowdfund contracts (workspace) via WSL.
set -euo pipefail
if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
export PATH="$HOME/.cargo/bin:$PATH"
# Work around a rustc 1.95 ICE in the incremental lint pass.
export CARGO_INCREMENTAL=0

SRC="/mnt/c/Users/Lenovo/OneDrive/Documents/Claude/Projects/stellar-orange-belt/contracts"
WORK="$HOME/orange-build"
rm -rf "$WORK"; mkdir -p "$WORK"
cp -r "$SRC/." "$WORK/"
cd "$WORK"
rustup target add wasm32v1-none >/dev/null 2>&1 || true

echo "== cargo test --workspace =="
cargo test --workspace 2>&1 | tail -30
echo "TEST_EXIT=${PIPESTATUS[0]}"

echo "== cargo build --target wasm32v1-none --release =="
cargo build --workspace --target wasm32v1-none --release 2>&1 | tail -8
echo "BUILD_EXIT=${PIPESTATUS[0]}"

echo "== wasms =="
ls -la "$WORK"/target/wasm32v1-none/release/*.wasm 2>/dev/null || echo "no wasms"
