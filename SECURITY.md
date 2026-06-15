# Security notes & known limitations

This is a **Stellar testnet** educational demo. It is intentionally scoped for
clarity, and the choices below are deliberate — documented here so they are not
mistaken for oversights.

## Testnet posture

- **No real value.** The `PLEDGE` (PLG) token is a demo asset on testnet.
- **The app never holds keys.** All signing, sending, and any fund movement is
  performed by the user in their own wallet. The frontend only builds, simulates,
  and submits transactions the user explicitly signs.
- **Simulation source.** Read-only calls are simulated from a funded public
  testnet account (`READ_SOURCE` in `src/lib/crowdfund.ts`). It is a throwaway
  account used only as a simulation source — never a signer, and no secret for it
  exists in this repo.

## Deliberate demo tradeoffs

- **Permissionless faucet** (`token.faucet`) lets anyone mint demo PLG so the live
  demo is usable without a separate funding step. A production token would remove
  this.
- **Single-admin mint** (`token.mint`) — fine for a demo; a production token would
  use a more robust admin/role model.
- **No contract upgradeability.** Contracts are deployed once; there is no admin
  upgrade path (a reasonable safety default for a demo).

## Known limitation: contributor-storage ceiling

The crowdfund contract keeps per-contributor pledges (`DataKey::Pledge(Address)`)
and campaign state in **instance** storage. This is simple and correct at demo
scale, but instance storage is a single serialized entry, so a campaign with a
very large number of distinct contributors would grow that entry over time. A
production version should:

- store per-contributor pledges in **persistent** storage keyed per address
  (as the token already does for balances), and
- bump TTL (`extend_ttl`) on long-lived campaign and pledge entries.

This does not affect the demo, which operates well within these bounds.

## Contract safety (reviewed)

- `contribute` / `claim` / `refund` each call `require_auth()` before any state
  change; `refund` zeroes the pledge **before** transferring (effects before
  interactions).
- Escrow is held at the contract's own address; payouts originate from the
  contract, so an external caller cannot drain or mis-claim it.
- `claim` pays only the stored recipient; `refund` only returns the caller's own
  pledge. Goal/deadline guards make claim and refund mutually exclusive, and a
  `Claimed` flag prevents double-claim.
- Negative-path behavior is covered by `#[should_panic]` tests
  (`contracts/*/src/test.rs`).

## Dependency advisories

`npm audit` reports advisories in transitive dependencies pulled in by the
standard Stellar tooling (`@stellar/stellar-sdk`, `@creit.tech/stellar-wallets-kit`
→ Trezor stack): `protobufjs`, `axios`, `elliptic`. These code paths are not
reachable in this read-only testnet browser flow (the RPC URL is hardcoded, key
material is handled only by the user's wallet extension). They are inherent to the
current Stellar SDK ecosystem; pin/upgrade once upstream ships fixed releases.

## Deployment and initialization

The contracts use an explicit `initialize` function rather than a Soroban
constructor. On a fresh deploy there is, in principle, a brief window in which
another party could call `initialize` before the deployer does. The deployed
testnet instances referenced in the README were initialized by the deployer
immediately after deploy, so this does not affect them. A production deployment
should use a Soroban constructor so deploy and initialize happen atomically in a
single transaction, removing the window entirely.

## Storage TTL

Persistent entries (token balances, campaign and pledge state) are not currently
bumped with `extend_ttl`. For a short-lived testnet demo this is fine, but a
long-running or production deployment should call `extend_ttl` on these entries
so dormant state does not expire.

## Token amounts

The PLEDGE token uses 0 decimals and small whole-number amounts, so the frontend
represents amounts as JS numbers. This is well within `Number.MAX_SAFE_INTEGER`
for the demo. A token with 7 decimals (stroops) or large balances should carry
amounts as bigint or decimal strings end to end.

## Reporting

This is a learning project. For issues, open a GitHub issue on the repository.
