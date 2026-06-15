# Rise In Submission - Orange Belt

## Target

Level 3 / Orange Belt: advanced Soroban dApp with inter-contract communication, frontend, tests, CI/CD, and live deployment.

## What to Review

- Two Soroban contracts: `pledge-token` and `crowdfund`.
- Cross-contract token transfers during `contribute`, `claim`, and `refund`.
- Wallet-signed writes with `prepareTransaction`, submit, and confirmation polling.
- Live campaign state, balances, pledge state, and token + crowdfund event feed.
- Contract tests, frontend tests, typecheck, production build, and GitHub Actions CI.

## Live Demo

https://stellar-orange-belt-eight.vercel.app

## Contracts

| Contract | Address | Explorer |
| --- | --- | --- |
| PLEDGE token | `CAMI57EGDROSD4OD2RAMLGZUFYWCWWGPSCCBFHSH23L63HTRFJWLFHFR` | https://stellar.expert/explorer/testnet/contract/CAMI57EGDROSD4OD2RAMLGZUFYWCWWGPSCCBFHSH23L63HTRFJWLFHFR |
| Crowdfund | `CB6HO45ESN7WPOB3WNQNYYM7OHTV6UDWWCQRS7TLSIADHBZD4AC4DS7V` | https://stellar.expert/explorer/testnet/contract/CB6HO45ESN7WPOB3WNQNYYM7OHTV6UDWWCQRS7TLSIADHBZD4AC4DS7V |

## Cross-contract Proof

| Field | Value |
| --- | --- |
| Transaction | `202feabe8666dc2bcc9be4e01858693a77bcb454a48213ecce6783bb51cee4e3` |
| Explorer | https://stellar.expert/explorer/testnet/tx/202feabe8666dc2bcc9be4e01858693a77bcb454a48213ecce6783bb51cee4e3 |
| Token event | `transfer`: backer -> crowdfund escrow, 1500 PLG |
| Crowdfund event | `contrib`: pledge recorded, 1500 PLG |

## Run Locally

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build

cd contracts
cargo test --workspace
cargo build --workspace --target wasm32v1-none --release
```

## CI/CD

GitHub Actions runs contract tests/build plus frontend typecheck/tests/build in `.github/workflows/ci.yml`. The frontend is deployed on Vercel.
