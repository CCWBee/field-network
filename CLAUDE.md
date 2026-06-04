# Field Network

A marketplace for verifiable real-world observations. Requesters post tasks with
USDC bounties on Base; workers capture geo-verified photos/data; submissions
are auto-scored, then accepted or disputed; escrow releases on acceptance.

## Status

**mk0, not audited, not deployed to mainnet.** See `SECURITY.md` for the
honest threat-model writeup. The recent remediation pass (Phase 1–4 commits)
closed the security and money-flow gaps found in an internal review; CI gates
are real now (no `continue-on-error`).

The marketplace is **operator-custodial** — the API holds an operator wallet
that signs on-chain transactions on behalf of workers and requesters. The
docs ("permissionless" framing in older commits) used to overstate this;
they have been corrected.

## Quick commands

```bash
npm install                    # workspace install
npm run db:generate            # prisma client
npm run db:push                # apply schema to Postgres
npm run dev:api                # API on port 3000
npm run dev:web                # web on port 3001
npm run dev:worker             # background jobs (claim-expiry, dispute deadlines)
npm test                       # all workspace tests
npm run build                  # build all packages
```

Postgres is required for full local dev (the schema is postgres-only). For
quick smoke runs, `docker compose up postgres redis minio` brings them up.

## Project layout

```
packages/
├── api/          # Express + Prisma REST API (port 3000)
├── web/          # Next.js 15 frontend (port 3001)
├── contracts/    # GroundTruthEscrow.sol + WorkerStaking.sol (Base L2)
├── mcp/          # MCP server exposing the API as tool calls
└── shared/       # Shared TypeScript types
```

## Stack

- **Backend**: Express 4, Prisma 6 (Postgres), Zod, BullMQ + Redis, pino logging.
- **Frontend**: Next.js 15, React 19, Tailwind, Zustand, React Query, Framer Motion.
- **Web3**: wagmi, viem, SIWE auth, ethers. Base mainnet (8453) / Base Sepolia (84532).
- **Storage**: S3-compatible (MinIO for dev, R2/S3 for prod) with signed URLs.
- **Auth**: JWT (HS256, algorithm-pinned), SIWE for wallets, delegated API tokens with scopes + spend caps + expiry.

## Key flows

### Auth

- Email/password fallback for non-wallet users.
- SIWE for wallet login. Domain, nonce, time, and chain ID are all pinned at
  verify time. Nonce is single-use and consumed atomically.
- Multiple wallet linking — same nonce protection on link.
- Refresh tokens are one-time-use, blacklisted on first use.
- Token blacklist via Redis. `BLACKLIST_FAIL_MODE` picks behaviour during
  Redis outages (closed = reject all, open = allow).

### Task lifecycle

`draft` → `posted` → `claimed` → `submitted` → `accepted` (or `rejected` → `disputed`).

### Submission flow

1. Worker claims (4h TTL) + stakes a percentage of the bounty.
2. Worker uploads artefacts. EXIF is extracted server-side and verified.
3. Verification runs (location, bearing, hash dedup, image quality, EXIF).
4. Worker finalises. Requester accepts or rejects.
5. Accept → escrow releases, stake returns.
6. Reject without dispute → stake returns, escrow refunds (benefit of doubt).
7. Worker disputes a rejection → multi-tier resolution.

### Worker staking

The off-chain stake calculation:

- Base: 15% of bounty (`baseStakeBps = 1500`).
- Strike penalty: +2% per strike on the worker's on-chain record.
- High-rep discount: -5% if `reputationScore >= 9000` (out of 10000).
- Clamped to `[5%, 30%]`.

On-chain: `WorkerStaking.calculateRequiredStake` does the same math, but
`strikeCount` is read from `workerStrikes[worker]` (caller-supplied input
ignored — see git blame on `WorkerStaking.sol`). `reputationScore` is
operator-trusted because there is no on-chain reputation.

### Dispute resolution

Three tiers:

- **Tier 1 (auto)**: Verification-score weighted result. >=80 worker wins,
  <=20 requester wins, otherwise escalate to Tier 2.
- **Tier 2 (jury)**: 5 jurors selected from high-reliability users. Stake-weighted
  votes, 48-hour window. Zero-vote case (everyone abstains / nobody votes)
  auto-escalates to Tier 3 instead of paying out by default.
- **Tier 3 (admin appeal)**: Loser may appeal with a 10% bounty stake. Admin
  resolves. Stake refunded on appeal won, forfeited on lost. Recorded as a
  ledger entry (the route handler is responsible for the on-chain USDC pull).

All resolution flows route through `services/disputes.resolveDispute` and the
canonical endpoint `POST /v1/disputes/:id/resolve`, which handles escrow split,
stake release/slash, arbitration fee, and ledger in one transaction. The
legacy `POST /v1/admin/disputes/:id/resolve` returns 410 Gone — it used to be
a parallel path that didn't touch stake.

## Database

Prisma schema at `packages/api/prisma/schema.prisma` (Postgres only). Key
models: `User`, `WalletLink`, `ApiToken`, `Task`, `TaskClaim`, `Submission`,
`Artefact`, `Decision`, `Dispute`, `DisputeJuror`, `Escrow`, `Stake`,
`LedgerEntry`, `ChainEvent`, `SiweNonce`, `AuditEvent`.

## Environment

See `packages/api/.env.example` and `.env.production.example` for full lists.
The ones most likely to bite if misconfigured:

- `JWT_SECRET` (>=32 chars in prod; refuses to start otherwise).
- `CORS_ORIGINS` (required in prod).
- `TRUST_PROXY` (required when behind a CDN).
- `SIWE_DOMAIN` and `SIWE_CHAIN_ID` (or `CHAIN_ID`) — required in prod.
- `BLACKLIST_FAIL_MODE` — closed by default in prod.
- `DATABASE_URL` — Postgres URL.
- `REDIS_URL` — required for token blacklist + BullMQ.
- `ESCROW_PROVIDER`, `STAKING_PROVIDER` — `mock` for dev, `onchain` for prod.
- `OPERATOR_PRIVATE_KEY` — only when `*_PROVIDER=onchain`.

For contract deploys: `MULTISIG_ADDRESS` is required for live nets unless
`ALLOW_DEPLOYER_ADMIN=true` is set explicitly. See deploy scripts in
`packages/contracts/scripts/`.

## Testing

- `npm test` at repo root runs the contract suite (Hardhat) plus the API
  vitest suite. The API DB-dependent tests require Postgres locally (or use
  CI which provisions one).
- Web E2E tests under `packages/web/e2e/` are currently a mocked frontend
  shell — they intercept `/v1/**` and run against a stub. Real end-to-end
  integration is a known gap.
- CI provisions Postgres + Redis services, refuses on `it.only`/`describe.only`,
  and fails loudly on any test/build/lint error (no `continue-on-error`).

## What's not built / known gaps

- No third-party security audit.
- Mocked frontend E2E only (no real-API integration suite yet).
- No genuine permissionless contract design (operator-custodial intentionally).
- No anti-Sybil checks despite the reputation system suggesting them
  (`docs/REPUTATION.md` overstates this — to be reconciled).
- No fuzz testing on contracts.
- `EmailAlertChannel` is a placeholder; only the webhook alert channel actually delivers.
- Sentry on the web is removed (the previous wrapper imported a config file
  that didn't exist). API-side Sentry works.
- Legal docs (`EULA.md`, `TERMS.md`, `PRIVACY.md`, `USAGE-POLICY.md`) are
  pre-launch drafts, not lawyer-reviewed.

## Resources

- `docs/ARCHITECTURE.md` — system diagram and money-flow notes.
- `docs/THREAT_MODEL.md` — companion to SECURITY.md, threat-by-threat.
- `docs/OPERATIONS.md` — on-call / runbook for common breakages.
- `docs/REPUTATION.md` — reputation formula (note: anti-Sybil sections are
  aspirational, not implemented).
- `docs/CONTRACT-OPERATIONS.md` — on-chain operations runbook.

## Branding note

The on-chain contracts are still named `GroundTruthEscrow` and `WorkerStaking`
(historical name). Renaming them to `FieldNetworkEscrow` is a pending
remediation phase. The events and ABIs you'll see on Basescan reference the
old name; the product UI uses "Field Network" throughout.
