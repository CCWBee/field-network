# Security

## Status

**Not audited.** There has been no third-party security audit of this codebase
or the deployed contracts. Use at your own risk on mainnet.

The codebase has been through internal review and the Phase 1 + Phase 4
remediation pass (see git history for `Phase 1` and `Phase 4` commits) closed
the issues found there. Known gaps and limitations are listed below.

## Threat model

### In scope (defended against)

- **Token forgery** — JWT verification is pinned to HS256 only; rejects `alg=none`
  and HS/RSA confusion attacks (`packages/api/src/middleware/auth.ts`).
- **SIWE replay** — verify pins domain, nonce, time, and chain ID. The nonce
  is consumed atomically before signature verification (`packages/api/src/routes/auth.ts`).
- **Spoofed IPs** — rate limiter uses `req.ip` (respecting `trust proxy`), not raw
  `X-Forwarded-For`. Operator must set `TRUST_PROXY` correctly for the deployment
  (`packages/api/src/middleware/rateLimit.ts`, `packages/api/src/index.ts`).
- **Common web vulnerabilities** — helmet, CORS allowlist (required in prod), zod
  input validation, parameterised queries (Prisma).
- **Reentrancy on the contracts** — OpenZeppelin `ReentrancyGuard`, checks-effects-
  interactions respected.
- **Stake redirect via primary-wallet swap** — slash recipient comes from the
  escrow's snapshotted `requesterWallet` (set at deposit time), not the requester's
  current primary wallet.
- **Bypassing the dispute window** — workers can no longer self-release before the
  auto-release delay. Only the requester (waiving their own window) or anyone
  after the delay can trigger release.

### Out of scope (you bear the risk)

- **Compromised operator key** — the API holds an operator wallet that can call
  `assignWorker`, `release`, `refund`, and `markStakeDisputed` on-chain. Key
  compromise = ability to move funds within the constraints of those functions.
  Mitigation: minimal balance, key rotation procedure below.
- **Compromised admin (multisig) key** — admin can change fees, pause contracts,
  set recipient addresses. Use a multisig with >1 signer; rotate signers if any
  device is suspected compromised.
- **Bugs in the API HTTP layer** — there is no formal verification, no fuzzing
  CI step beyond `npm audit`, and route-level integration tests are limited.
- **Off-chain reputation manipulation** — reputation/strike counts are computed
  by the API. The contract reads on-chain strike counts directly, but the
  initial population of strikes happens via API-initiated slashes.

### Known unmitigated centralisation

The contracts are **operator-custodial**, not "permissionless". `assignWorker`,
the staking entry points (`stake`, `stakeFor`), and dispute resolution all
require an operator or resolver role held by a Field Network wallet. Workers
cannot stake themselves directly. This is a deliberate design choice for
mk0; the docs (`PRODUCT-PLAN.md`, `docs/CONTRACT-OPERATIONS.md`) reflect it
honestly. A future "actually permissionless" version would require contract
rewrites.

## Reporting a vulnerability

Please do not open a public GitHub issue.

1. Email the project owner directly (see `package.json` author or repo owner).
2. Include reproduction steps and the affected file/line if possible.
3. Allow at least 14 days for a fix before public disclosure.

## Wallet operations

### Operator wallet (API hot wallet)

The API uses an operator wallet to submit on-chain transactions. Treat it as a
hot wallet with minimal funds and minimal privileges.

- Key loaded only from `OPERATOR_PRIVATE_KEY` env. Never logged. Validated
  format before use.
- Holds **only** `OPERATOR_ROLE` on each contract — cannot change fees, pause,
  grant roles, or move funds outside the role's allowed functions.
- Keep ~0.05 ETH for gas. Top up via monitoring alerts.
- Do NOT store USDC in this wallet.

### Multisig (admin)

`DEFAULT_ADMIN_ROLE` and `DISPUTE_RESOLVER_ROLE` must be transferred to a
multisig (Gnosis Safe recommended) as part of deployment. The deploy scripts
refuse to leave the deployer EOA in control on live networks unless
`ALLOW_DEPLOYER_ADMIN=true` is set explicitly. See `packages/contracts/scripts/deploy.ts`.

### Key rotation (operator)

1. Pause the relevant contract from the multisig.
2. Generate a new operator wallet on an air-gapped machine.
3. From the multisig, `grantRole(OPERATOR_ROLE, newWallet)`.
4. Update `OPERATOR_PRIVATE_KEY` in the API environment, restart API.
5. From the multisig, `revokeRole(OPERATOR_ROLE, oldWallet)`.
6. Unpause.
7. Audit recent transactions on Basescan for unauthorised activity.

### Key rotation (admin / multisig signer)

If a multisig signer is compromised, replace the signer through the multisig's
own rotation flow. The contracts' `DEFAULT_ADMIN_ROLE` is held by the multisig
address, not the individual signer, so the contract role doesn't change.

## Configuration that affects security

These environment variables change the security posture and should be set
deliberately:

| Variable | Effect of misconfiguration |
|----------|----------------------------|
| `JWT_SECRET` | Fewer than 32 chars in production refuses to start. Required. |
| `CORS_ORIGINS` | Production refuses to start without it. |
| `TRUST_PROXY` | Unset behind a CDN means `req.ip` falls back to socket address; X-Forwarded-For is ignored (rate limiter cannot be bypassed by spoofing). Set to `true` or a CIDR list when actually behind a proxy. |
| `SIWE_DOMAIN` | Production requires this. Pins SIWE signatures to your domain. |
| `SIWE_CHAIN_ID` (or `CHAIN_ID`) | Production requires this. Pins SIWE signatures to your chain. |
| `BLACKLIST_FAIL_MODE` | `closed` (prod default) rejects tokens during Redis outages; `open` allows them. |
| `GEOBLOCK_FAIL_CLOSED` | Set `true` if you require all traffic to arrive via your geo-aware CDN. |
| `MULTISIG_ADDRESS` (deploy time) | Required for live-net contract deploys. Without it, deployer EOA retains godmode. |

## Contributor checklist

When opening a PR, verify:

- [ ] No secrets in code or commit history.
- [ ] User input validated with zod.
- [ ] URLs validated to allow only http/https (use `safeUrl` from `packages/api/src/utils/validation.ts`).
- [ ] No direct DB access from the web package (CI enforces this).
- [ ] No `it.only` or `describe.only` in tests (CI enforces this).
- [ ] No `continue-on-error` added to CI gates.
- [ ] Changes to auth, rate limit, or any money-moving path include tests.

## Audit history

This file used to contain a "9/10 audit passed" claim. It was self-grading
masquerading as third-party validation. There has been no audit. Removed in
the Phase 6 docs honesty pass.

The Phase 1 + Phase 2 + Phase 4 remediation closed the specific issues found
during a multi-agent internal review (see commits in `git log` for that
branch). The remediation did not include external review.
