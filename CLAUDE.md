# Field Network

A decentralized marketplace for verifiable real-world observations. Post tasks with bounties, collectors capture geo-verified photos/data, automated verification validates submissions, and USDC escrow releases on acceptance.

## Quick Commands

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push

# Start API server (dev)
npm run dev:api

# Start web frontend (dev)
npm run dev:web

# Build all packages
npm run build
```

## Project Structure

```
packages/
├── api/          # Express.js REST API (port 3000)
├── web/          # Next.js 14 frontend (port 3001)
├── contracts/    # Solidity escrow contract (Base blockchain)
└── shared/       # Shared TypeScript types
```

## Tech Stack

- **Backend**: Express.js 4.21, Prisma 6.3 (SQLite dev / Postgres prod), Zod validation
- **Frontend**: Next.js 15.1, React 19, Tailwind CSS, Zustand 5, React Query
- **Web3**: wagmi, viem, SIWE auth, ethers.js
- **Blockchain**: Base (L2), USDC escrow, Hardhat
- **Security**: Helmet 8, express-rate-limit, safe URL/JSON validation

## Key Patterns

### Authentication
- SIWE (Sign-In with Ethereum) for wallet auth
- Email/password as fallback
- Delegated API tokens with scopes, spend caps, expiry (Polymarket-style)

### Task State Machine
`draft` → `posted` → `claimed` → `submitted` → `accepted`

### Submission Flow
1. Worker claims task (4hr TTL)
2. Uploads artefacts with metadata
3. System generates proof bundle (SHA256 hashes)
4. Verification checks run
5. Requester accepts/rejects
6. Escrow releases on acceptance

## Current Implementation Status (mk0)

### Working
- [x] User registration/login (email + wallet)
- [x] SIWE wallet authentication
- [x] Multiple wallet linking
- [x] Task CRUD operations
- [x] Task claiming with TTL
- [x] Submission upload flow
- [x] Proof bundle generation
- [x] Basic verification framework
- [x] Dispute workflow structure
- [x] Smart contract (GroundTruthEscrow.sol)
- [x] Chain indexer service
- [x] Light theme UI with gradient mesh aesthetic

### Recently Completed
- [x] Escrow funding on task publish (mock provider, swappable)
- [x] Escrow release on submission acceptance
- [x] Object storage with signed URLs (mock provider, local files)
- [x] Token refresh endpoint
- [x] Location/GPS verification (Haversine distance calculation)
- [x] Bearing verification with tolerance
- [x] Duplicate hash detection across submissions
- [x] Image dimension checks

### Remaining for Production
- [x] Wire on-chain escrow (OnChainEscrowProvider with viem)
- [x] EXIF metadata extraction from uploaded images (sharp + exif-reader)
- [x] Deploy scripts and CI/CD (GitHub Actions + Docker)
- [x] Production database migration (PostgreSQL ready with pooling)
- [x] Background job infrastructure (BullMQ + Redis)
- [ ] Deploy contracts to Base mainnet

## Database

Prisma schema in `packages/api/prisma/schema.prisma`. Key models:
- User, WalletLink, ApiToken
- Task, TaskClaim, TaskTemplate
- Submission, Artefact, Decision, Dispute
- Escrow, LedgerEntry, ChainEvent

## API Routes

```
POST /v1/auth/register, /login, /siwe/nonce, /siwe/verify
GET  /v1/auth/me
POST /v1/auth/wallet/link, /api-tokens

GET  /v1/tasks (filters: status, template, bbox, bounty)
POST /v1/tasks, /v1/tasks/:id/publish, /cancel, /claim

POST /v1/submissions/:taskId/submissions
POST /v1/submissions/:id/artefacts, /finalise, /accept, /reject, /dispute

GET  /v1/disputes (admin)
POST /v1/disputes/:id/resolve
```

## Environment Variables

```env
# API
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret"
CORS_ORIGINS="http://localhost:3000"

# Escrow (mock for dev, onchain for prod)
ESCROW_PROVIDER="mock"
CHAIN_ID="84532"
BASE_RPC_URL="https://sepolia.base.org"
ESCROW_CONTRACT_ADDRESS="0x..."
OPERATOR_PRIVATE_KEY="0x..."

# Web
NEXT_PUBLIC_API_URL="http://localhost:3000"
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="..."
```

## Branding

- **Name**: Field Network
- **Tagline**: Decentralized real-world data on demand
- **Colors**: Teal primary (#14b8a6), white surface, soft gradient mesh
- **Style**: Light theme, glassmorphism cards, gradient text accents

## Deployment

### Local Development
```bash
npm run dev:api    # Terminal 1 - API on port 3000
npm run dev:web    # Terminal 2 - Web on port 3001
```

### Docker
```bash
docker-compose up  # Start API, web, and PostgreSQL
```

### Production Deployment
1. Deploy contracts: `npm run deploy:base --workspace=@ground-truth/contracts`
2. Set `ESCROW_PROVIDER=onchain` and configure contract address
3. Push via CI/CD (GitHub Actions deploys to Railway/Vercel on main)

---

## Current Session Status (Jan 2026)

### What's Working
- User registration (email + wallet via SIWE)
- Unified accounts (all users can post tasks AND collect bounties)
- Light theme with teal accents throughout all pages
- Task creation flow with proper validation
- Task claiming and submission (no role restrictions)
- API running on port 3000, Web on port 3001
- Security audit passed (9/10 score)
- Production deployment guide ready

### Session History

#### Session 2: Security Audit & Production Prep (Jan 13, 2026)

**Security Improvements:**
- Updated all dependencies to latest stable versions
  - Prisma 5.7 → 6.3
  - Next.js 14.0 → 15.1
  - React 18 → 19
  - Express 4.18 → 4.21
  - Helmet 7.1 → 8.0
- Added safe URL validation (protocol whitelist prevents `javascript:` URI injection)
- Added safe JSON parsing with Zod schema validation
- Created `packages/api/src/utils/validation.ts` with reusable validators

**New Documentation:**
- `SECURITY.md` - Security practices, audit findings, contributor checklist
- `PRODUCTION.md` - Step-by-step deployment guide for Railway + Vercel

**Files Changed:**
- `packages/api/src/routes/profile.ts` - Safe URL + JSON parsing
- `packages/api/src/routes/webhooks.ts` - Safe URL + JSON parsing
- `packages/api/src/utils/validation.ts` - New validation utilities
- All `package.json` files - Dependency updates

#### Session 1: UI Fixes & Role System Cleanup

**Removed Legacy Role System from Worker Routes:**
- `packages/api/src/routes/claims.ts` - Removed `requireRole('worker')`
- `packages/api/src/routes/submissions.ts` - Removed `requireRole('worker')`
- `packages/api/src/routes/uploads.ts` - Removed `requireRole('worker')`
- Note: `requireRole('admin')` kept for dispute resolution (correct)

**Fixed Task Creation Validation:**
- Moved `getDefaultDates()` outside component in `packages/web/src/app/dashboard/requester/new/page.tsx`
- Added client-side validation before API call

**Fixed Light Theme Colors:**
- Updated all pages from dark theme colors to light theme
- Color mapping: `text-white` → `text-slate-800`, etc.

### Known Issues Remaining
- WalletConnect SSR warnings (indexedDB not defined) - cosmetic only
- WalletConnect needs valid project ID from https://cloud.walletconnect.com
- Run `npm install` after pulling to get updated dependencies

### Architecture Notes

#### Unified Account Model
All users can both post tasks (requester) AND claim/complete tasks (worker). The legacy `role` field in the database still exists but is not enforced on routes. The only role-based restriction is `admin` for dispute resolution.

#### Security Model
- Frontend never talks directly to database (API-first)
- All sensitive calculations server-side
- URL inputs validated for http/https only
- JSON from database parsed with schema validation
- Rate limiting: 100 req/15min per IP
- Secrets only in environment variables (never in client code)

#### Color System (Light Theme)
- **Primary**: `field-500` (#14b8a6) - teal
- **Text**: `slate-800` (headings), `slate-600` (body), `slate-500` (muted)
- **Surfaces**: `bg-surface` (white), `bg-surface-50` (off-white), `glass` (glassmorphism)
- **Borders**: `border-surface-200/300`

### Quick Resume Checklist
1. Pull latest: `git pull origin master`
2. Install deps: `npm install`
3. Generate Prisma: `npm run db:generate`
4. Start API: `npm run dev:api` (must be running first)
5. Start Web: `npm run dev:web`
6. Open: http://localhost:3001

### Next Priority Items
- [ ] Purchase domain (field-network.com available)
- [ ] Set up Railway + Vercel accounts
- [ ] Deploy to production (see PRODUCTION.md)
- [ ] Add map view for task locations
- [ ] Mobile responsive improvements
- [ ] Test full task flow end-to-end

#### Session 3: Sprint 1 - Production Database & Infrastructure (Jan 19, 2026)

**PostgreSQL Migration:**
- Updated `packages/api/prisma/schema.prisma` for PostgreSQL compatibility
  - Changed provider from `sqlite` to `postgresql`
  - Converted String JSON fields to native `Json` type
  - Added `@db.Text` annotations for long text fields
- Created comprehensive seed script (`packages/api/prisma/seed.ts`)
  - 6 test users (admin, 2 requesters, 3 workers)
  - 10 tasks in various states (draft, posted, claimed, submitted, accepted, disputed, expired)
  - 5 submissions with artefacts
  - User stats, badges, escrows, and reputation events

**Infrastructure:**
- Docker Compose now includes:
  - PostgreSQL 16 with health checks and backup volume
  - Redis 7 for job queue persistence
  - MinIO for S3-compatible object storage (local dev)
  - Background worker service
- Connection pooling configured via DATABASE_URL query params
  - `connection_limit=10` for API
  - `connection_limit=5` for worker
  - `pool_timeout=30` seconds

**Background Jobs (BullMQ + Redis):**
- Created `packages/api/src/lib/queue.ts` - Job queue management
- Created `packages/api/src/jobs/claim-expiry.ts` - Expires abandoned claims
  - Runs every 5 minutes
  - Updates claim status to 'expired'
  - Reduces worker reliability score by 5 points
  - Resets worker streak counter
  - Creates reputation events and notifications
- Created `packages/api/src/worker.ts` - Worker process entry point
- Added `npm run dev:worker` command

**Health Endpoints:**
- Created `packages/api/src/routes/health.ts`
  - `GET /health` - Full system status (db, redis)
  - `GET /health/ready` - Kubernetes readiness probe
  - `GET /health/live` - Kubernetes liveness probe
- Returns 200 (ok), 503 (degraded/unhealthy)

**Documentation:**
- Created `docs/BACKUP.md` - PostgreSQL backup and recovery guide
- Created `scripts/backup-db.sh` - Database backup script
- Created `scripts/migrate-sqlite-to-postgres.ts` - Data migration helper

**Testing:**
- Created `packages/api/tests/integration/database.test.ts`
  - User CRUD with relations
  - Task lifecycle
  - Submission flow
  - Foreign key integrity
  - Transaction rollback behavior

**Files Created:**
- `packages/api/src/lib/queue.ts`
- `packages/api/src/jobs/index.ts`
- `packages/api/src/jobs/claim-expiry.ts`
- `packages/api/src/worker.ts`
- `packages/api/src/routes/health.ts`
- `packages/api/prisma/seed.ts`
- `packages/api/.env.test`
- `packages/api/tests/integration/database.test.ts`
- `scripts/backup-db.sh`
- `scripts/migrate-sqlite-to-postgres.ts`
- `docs/BACKUP.md`

**Files Modified:**
- `docker-compose.yml` - Added Redis, MinIO, worker service
- `packages/api/prisma/schema.prisma` - PostgreSQL + JSON types
- `packages/api/package.json` - Added bullmq, ioredis, seed script
- `packages/api/src/index.ts` - Health routes, graceful shutdown
- `packages/api/src/services/database.ts` - Connection pooling, health check
- `packages/api/.env.example` - Redis URL, storage config
- `package.json` - Added dev:worker, db:seed scripts

**New Dependencies:**
- `bullmq` ^5.34.0 - Job queue library
- `ioredis` ^5.4.1 - Redis client

