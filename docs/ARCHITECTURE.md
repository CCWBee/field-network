# Architecture

One-page mental model of how Field Network is wired up.

## System diagram

```
                +-------------------------------+
                |          Web (Next.js)        |
                |   - Auth, dashboards, jury    |
                |   - SIWE via wagmi/viem       |
                +---------------+---------------+
                                | HTTPS, JWT
                                v
                +---------------+---------------+
                |       API (Express + Prisma)  |
                |   - Routes: auth, tasks,      |
                |     submissions, disputes,    |
                |     admin, gdpr, users, ...   |
                |   - Middlewares: auth,        |
                |     rate-limit, geoblock,     |
                |     trust-proxy               |
                +---+-----+-------+---------+---+
                    |     |       |         |
        +-----------+     |       |         +--------------+
        |                 |       |                        |
   +----v----+      +-----v---+   v                  +-----v----+
   |Postgres |      |  Redis  |   |                  |  Base L2 |
   |(Prisma) |      |(BullMQ +|   |                  |          |
   |         |      | token   |   |                  |  USDC    |
   +---------+      | blocklist)|  |                  |  Escrow  |
                    +---------+   |                  |  Staking |
                                  |                  +----------+
                                  v                       ^
                              +---+----+                  |
                              |  S3 /  |                  |
                              | MinIO  |                  |
                              | (artefacts)               |
                              +--------+                  |
                                                          |
                              +----------+    write txs   |
                              | Worker   +----------------+
                              | (BullMQ) |    (operator wallet)
                              | - claim  |
                              |   expiry |
                              | - dispute|    read events
                              |   deadlines  +-----------+
                              | - webhook|               |
                              |   deliver|        Chain  |
                              +----------+        Indexer|
                                              (`chainIndexer.ts`)
                                                         |
                                                         v
                                                    +----+----+
                                                    | Postgres|
                                                    | (events)|
                                                    +---------+
```

## Money flow

There are three movements to keep clean in your head:

1. **Bounty escrow** (`FieldNetworkEscrow.sol`):
   - Requester `deposit`s USDC into the escrow at task publish.
   - On `accept` → 24h auto-release window starts.
   - `release` (requester immediately, or anyone after the window) sends USDC
     to the worker (minus the platform fee, which goes to `feeRecipient`).
   - `refund` returns USDC to the requester (only allowed in `Funded` state).
   - `openDispute` freezes the auto-release. `resolveDispute(workerShare)`
     splits the net amount between worker and requester.

2. **Worker stake** (`WorkerStaking.sol`):
   - Operator calls `stakeFor(worker, taskId, ...)` when worker claims a task,
     pulling USDC from the worker's wallet (worker pre-approves the contract).
   - `releaseStake` returns USDC to the worker. Permissionless for the worker;
     after a 24h delay anyone can trigger it.
   - `slashStake(taskId, worker, requester, requesterShareBps)` takes the full
     stake and splits it between requester and platform. `partialSlash` allows
     returning some to the worker.
   - On-chain `workerStrikes[worker]` increments on each slash.

3. **Appeal stake** (Tier-3 only, off-chain ledger):
   - The losing party of a Tier-2 jury verdict may appeal with 10% of the
     bounty.
   - The API records an `appeal_stake_held` ledger entry at escalation. The
     actual on-chain pull is the route handler's responsibility (currently
     mock-only).
   - On admin resolution, `appeal_stake_refund` (appeal won) or
     `appeal_stake_forfeit` (appeal lost) is recorded.

## State machine

```
Task:   draft -> posted -> claimed -> submitted -> accepted
                              |             |
                              |             +-> rejected -> disputed
                              |
                              +-> expired
                              +-> cancelled

Submission:  draft -> uploading -> finalised -> accepted
                                       |
                                       +-> rejected -> disputed

Dispute:  tier1_evidence -> tier1_review -> (resolved)
                                |
                                +-> tier2_voting -> (resolved)
                                        |
                                        +-> tier3_appeal -> (resolved)
```

Tier transitions are recorded in `Dispute.tierHistory` (Json array of `TierTransition`).

## Components by package

### `packages/api`

- `src/index.ts` — Express app wiring, middleware order, route mounts.
- `src/routes/*` — REST handlers. One file per resource.
- `src/services/*` — business logic the routes call into. `disputes.ts` is
  the canonical resolution path (escrow + stake + ledger + audit).
- `src/middleware/auth.ts` — JWT (HS256 only), API key, role/scope guards,
  admin session hardening.
- `src/jobs/*` — BullMQ workers. Claim expiry every 5min; dispute deadline
  check every 5min.
- `src/lib/queue.ts` — BullMQ + Redis client wiring.
- `prisma/schema.prisma` — Postgres-only schema. ~30 models.

### `packages/web`

- App router (Next.js 15). Each `app/<route>/page.tsx` is a server or client
  component.
- `src/lib/api.ts` — API client. Token refresh, session expiry events.
- `src/lib/store.ts` — Zustand auth store.
- `src/lib/web3/*` — wagmi + viem setup, SIWE hook.
- `src/components/ui/*` — shared UI primitives.
- E2E suite under `e2e/` is **mocked** — intercepts `/v1/**` and runs against
  a stub. Not a real integration test.

### `packages/contracts`

- `contracts/FieldNetworkEscrow.sol` — USDC escrow (deposit, accept, release,
  refund, dispute, resolveDispute).
- `contracts/WorkerStaking.sol` — Worker stake (stake/stakeFor, release,
  slash, partialSlash, workerStrikes counter).
- `scripts/deploy.ts`, `deploy-staking.ts` — Hardhat deploys with multisig
  handoff. Refuses to leave the deployer EOA as admin on live nets.

### `packages/mcp`

MCP server exposing API operations as tool calls (so AI agents can act as
requesters/workers/jurors).

## Operator-custodial caveat

This is **not** a permissionless contract. The API holds an operator wallet
(`OPERATOR_PRIVATE_KEY`) that:

- Signs `assignWorker` and `stakeFor` calls.
- Signs `slashStake` calls when the API determines a worker lost a dispute.
- Has `OPERATOR_ROLE` only — cannot change fees, pause, or grant other roles
  (those require the multisig with `DEFAULT_ADMIN_ROLE`).

If the operator key is compromised, the attacker can:

- Assign workers to escrows and stake on their behalf (limited blast radius —
  funds are escrowed for the worker).
- Slash any active stake.
- Cannot change contract parameters, pause, or grant roles.

See `SECURITY.md` for the full threat model and `docs/CONTRACT-OPERATIONS.md`
for operational procedures.
