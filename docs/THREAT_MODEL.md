# Threat Model

Companion to `SECURITY.md`. Lists attackers we defend against, attackers we
don't, and the specific mitigations.

## Attacker classes

### A1. Anonymous attacker on the internet

- Cannot brute-force JWTs (HS256-pinned, 32-char secret enforced in prod).
- Cannot replay SIWE signatures (domain + nonce + time + chainId all pinned).
- Cannot bypass rate limits by spoofing X-Forwarded-For (limiter uses `req.ip`
  which respects `trust proxy`).
- Cannot post arbitrary JS via task descriptions / profile URLs (`safeUrl` and
  `safeJsonParse` block `javascript:`, `data:`, `file:` URIs).
- Can crawl public endpoints (`/v1/marketplace/tasks`, public profiles).

### A2. Authenticated low-rep user

- Cannot accept submissions they don't own.
- Cannot escalate disputes they aren't a party to.
- Cannot impersonate other wallets (SIWE binds to the address that signed).
- Cannot grant themselves API token scopes they don't already have.
- Subject to stricter rate limits than authenticated trusted users.

### A3. Authenticated user with reputation

- Same as A2 but lower stake requirements.
- Cannot directly drain escrows; escrow release goes only to the assigned
  worker after `accept`.
- Cannot redirect their own slash payout by changing primary wallet between
  dispute open and resolution — slash recipient is snapshotted on the escrow
  at deposit time.

### A4. Compromised juror account

- Can cast one vote per dispute they are selected for.
- Cannot select themselves for additional juries (jurors are server-picked).
- One juror cannot swing a dispute alone (5 jurors, stake-weighted; ties go
  to worker only if there are non-zero votes on both sides; zero-vote case
  escalates to admin).

### A5. Compromised operator wallet

The operator wallet is the API's hot wallet for signing on-chain transactions.

**What they can do:**

- Assign any worker to any escrow (via `assignWorker`).
- Call `stakeFor(victim, taskId, ...)` — but this pulls USDC from the victim,
  who must have pre-approved the contract; no funds move otherwise.
- Slash any active stake (via `slashStake` / `partialSlash`). Funds go to the
  recorded requester + platform recipient — operator can't redirect to a
  wallet they control unless they also control the multisig (admin).

**What they cannot do:**

- Change platform fee, fee recipient, or auto-release delay (admin only).
- Pause contracts (admin only).
- Grant or revoke roles (admin only).
- Drain escrow funds (release goes to the worker recorded at `assignWorker`
  time, not an arbitrary address).

**Mitigation:** keep operator wallet at minimal ETH balance; rotate via
multisig if compromised (see `SECURITY.md`).

### A6. Compromised admin (multisig signer)

**What they can do (with enough cosigners):**

- Change platform fee (capped at 10%) and recipient.
- Pause contracts.
- Grant any role to anyone.
- Resolve disputes with arbitrary worker share.

**Mitigation:** require >1 signer on the multisig. Rotate compromised
signers through the multisig's own flow. The contract's `DEFAULT_ADMIN_ROLE`
points at the multisig address, not at individual signers.

### A7. Malicious requester

- Cannot accept their own submission without first claiming it as worker
  (their accept call on a worker's submission triggers release to the worker).
- Cannot refund an escrow after a worker has claimed without operator
  involvement (the contract's `refund` requires no assigned worker, or
  operator role).
- Can grief workers by refusing to accept and refusing to dispute — leaves
  the escrow stuck until the auto-release delay (24h post-acceptance) or
  operator intervention. Known limitation; mitigated by reputation impact
  on requesters who do this.

### A8. Malicious worker

- Cannot self-release escrow before the dispute window passes (`release`
  rejects worker calls before `releaseAfter`).
- Cannot fake EXIF/GPS undetected — server runs verification checks on
  artefacts at finalise time.
- Cannot collect on duplicate submissions — duplicate-hash detection in
  verification.
- Cannot stake themselves with fake low strike counts — on-chain
  `workerStrikes` is read directly on the staking write path.

### A9. Sybil farmer

**Not currently defended against.** The reputation formula is computed from
data within this product only; nothing prevents one person creating multiple
accounts and gaming it. `docs/REPUTATION.md` describes IP fingerprinting and
collusion detection that are **aspirational, not implemented**. Adding them
is a known gap.

## Asset map

| Asset | Where stored | Who can read | Who can write |
|-------|--------------|--------------|----------------|
| User passwords | Postgres (bcrypt) | API only | User via auth route |
| JWT secret | env (`JWT_SECRET`) | API only | Deployer |
| Operator private key | env (`OPERATOR_PRIVATE_KEY`) | API only | Deployer |
| Bounty USDC | On-chain escrow | n/a | Per contract roles |
| Worker stake USDC | On-chain staking contract | n/a | Per contract roles |
| Artefacts (photos) | S3 + signed URLs | Authenticated parties to the task | Worker who uploads |
| Reputation / strike count | Postgres + on-chain (strikes) | Public for profile data | API via reputation service |
| Audit logs | Postgres (`auditEvent`, `disputeAuditLog`) | Admin only | API (append-only) |

## Cryptographic primitives

- **JWT**: HS256 only (pinned via `algorithms: ['HS256']` on every `jwt.verify` site).
- **SIWE**: EIP-191 sign-message. Verified with siwe library + explicit
  domain/nonce/time/chainId checks (`packages/api/src/routes/auth.ts`).
- **Stake IDs**: `keccak256(abi.encodePacked(taskId, worker))` — fixed-length
  inputs so no encoding ambiguity.
- **Random nonces**: SIWE nonces generated via `siwe.generateNonce()` (csprng).
- **Password hashing**: bcrypt (cost factor 12).
- **Artefact integrity**: SHA-256 of file content stored on `Artefact.sha256`
  for duplicate detection and tamper detection.

## Out of scope

- Side-channel attacks on the host machine (timing, memory, hardware).
- Browser extension malware on user devices.
- Social-engineering attacks against users to send their wallet's signed messages.
- Quantum cryptanalysis (long-term).
- Liveness attacks on the underlying Base L2 (chain pause, sequencer downtime).
