# Stellar Fund — Soroban Crowdfunding dApp

A production-style crowdfunding dApp on the **Stellar testnet**, built with **two
Soroban smart contracts that talk to each other**. A campaign contract escrows
contributions by making a **cross-contract call** into a token contract on every
pledge, and releases funds with a goal-and-deadline policy (claim on success,
refund on failure).

> **Rise In — Stellar Journey to Mastery · Level 3 (Orange Belt).**
> Theme: an advanced contract with **inter-contract communication**, a real
> frontend, tests, and CI/CD.

**Live demo:** https://stellar-orange-belt-eight.vercel.app
**Network:** Stellar Testnet (Soroban)

---

## What it does

- **Connect** any Stellar wallet (Freighter, Albedo, xBull, …) via Stellar Wallets Kit.
- **Faucet** — mint yourself demo `PLEDGE` (PLG) tokens (permissionless, for the demo).
- **Contribute** — pledge PLG to the campaign. The crowdfund contract pulls your
  tokens into escrow via a **cross-contract `transfer`** on the token contract.
- **Claim** — once the goal is met and the deadline passes, the recipient
  withdraws the pot (escrow → recipient, again cross-contract).
- **Refund** — if the deadline passes without meeting the goal, contributors
  reclaim their pledge.
- **Live state** — funding progress, status, time-left, balances, and a recent
  on-chain events feed, each linking to stellar.expert.

---

## Inter-contract communication (the core requirement)

The **crowdfund** contract never holds token logic itself. On every pledge it
calls into the **PLEDGE token** contract:

```rust
// contracts/crowdfund/src/lib.rs  (contribute)
let client = token::Client::new(&e, &token_addr);
client.transfer(&from, &e.current_contract_address(), &amount); // cross-contract call
```

A single user signature authorizes the whole invocation tree: the crowdfund's
`from.require_auth()` **and** the nested `token.transfer` sub-invocation.

### Verified on-chain proof

One real `contribute` transaction emits **two events from two different
contracts** in the same transaction — the signature of a cross-contract call:

| Source contract | Event | Meaning |
| --- | --- | --- |
| PLEDGE token `CAMI57…FHFR` | `transfer` | backer → crowdfund escrow, 1500 |
| Crowdfund `CB6HO45E…DS7V` | `contrib`  | pledge recorded, 1500 |

**Transaction:** [`202feabe…cee4e3`](https://stellar.expert/explorer/testnet/tx/202feabe8666dc2bcc9be4e01858693a77bcb454a48213ecce6783bb51cee4e3)

---

## Deployed contracts (testnet)

| Contract | Address | Explorer |
| --- | --- | --- |
| PLEDGE token (`pledge-token`) | `CAMI57EGDROSD4OD2RAMLGZUFYWCWWGPSCCBFHSH23L63HTRFJWLFHFR` | [view](https://stellar.expert/explorer/testnet/contract/CAMI57EGDROSD4OD2RAMLGZUFYWCWWGPSCCBFHSH23L63HTRFJWLFHFR) |
| Crowdfund (`crowdfund`) | `CB6HO45ESN7WPOB3WNQNYYM7OHTV6UDWWCQRS7TLSIADHBZD4AC4DS7V` | [view](https://stellar.expert/explorer/testnet/contract/CB6HO45ESN7WPOB3WNQNYYM7OHTV6UDWWCQRS7TLSIADHBZD4AC4DS7V) |

Campaign: goal **5,000 PLG**, recipient `GDDEFEHHPEDTLRT2STBHBUYUT57X67WH4DSV67OZJKP2XO24G2XZQJI2`.

---

## Architecture

```
React + Vite + TS (src/)
  ├─ lib/wallet.ts      Stellar Wallets Kit (multi-wallet connect + sign)
  ├─ lib/crowdfund.ts   read (simulate) + write (prepare→sign→send→poll), events
  ├─ lib/format.ts      pure presentation helpers (progress %, addr, time-left)
  └─ App.tsx            UI: campaign, faucet, contribute, claim, refund, events
            │ @stellar/stellar-sdk (Soroban RPC)
            ▼
Soroban contracts (contracts/)  — Cargo workspace
  ├─ token/      PLEDGE token: initialize, faucet, mint, transfer, balance
  └─ crowdfund/  campaign: initialize, contribute*, claim*, refund*, getters
                 (*) contribute/claim/refund perform cross-contract token moves
```

- **Reads** use `simulateTransaction` + `scValToNative` (no signature, instant).
- **Writes** build → `prepareTransaction` → wallet signs → `sendTransaction` →
  poll `getTransaction` until success, then refresh state.

---

## Tech stack

- **Contracts:** Rust, `soroban-sdk` 26, target `wasm32v1-none`, stellar-cli 26.
- **Frontend:** React 19, Vite, TypeScript (strict), `@creit.tech/stellar-wallets-kit`, `@stellar/stellar-sdk` v15.
- **Tests:** `cargo test` (contracts), Vitest + Testing Library (frontend).
- **CI:** GitHub Actions — contracts and frontend jobs. **Deploy:** Vercel.

---

## Run it locally

### Frontend

```bash
npm install
npm run dev        # http://localhost:5175
npm run typecheck
npm run test       # Vitest
npm run build
```

### Contracts (build, test, deploy)

The wasm build targets `wasm32v1-none` and is driven from WSL/Linux:

```bash
cd contracts
rustup target add wasm32v1-none
cargo test --workspace                                   # unit tests (host)
cargo build --workspace --target wasm32v1-none --release # wasm

# convenience scripts (run from WSL):
bash scripts/wsl-build-test.sh        # copy → test → build
bash scripts/wsl-deploy.sh            # deploy + initialize both contracts
bash scripts/wsl-seed-contribution.sh # faucet + one cross-contract contribute
```

---

## Tests

- **Contracts** (`cargo test --workspace`): token faucet/transfer/insufficient-balance;
  crowdfund cross-contract contribute, claim-on-success, refund-on-failure,
  claim-before-deadline panic.
- **Frontend** (`npm run test`): pure formatting helpers and the accessible
  `<Progress>` component (9 cases).

CI runs both suites plus a typecheck and production build on every push and PR
(`.github/workflows/ci.yml`).

---

## Security & known limitations

This is a **testnet** demo. The `PLEDGE` token has a permissionless faucet and no
real value. Wallet signing, sending, and any fund movement are always performed
by the user in their own wallet. Deliberate demo tradeoffs (permissionless faucet,
single-admin mint, instance-storage contributor ceiling) and the contract safety
review are documented in [SECURITY.md](SECURITY.md).
