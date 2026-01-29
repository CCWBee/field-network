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
1. Worker claims task (4hr TTL) + stakes percentage of bounty
2. Uploads artefacts with metadata
3. System generates proof bundle (SHA256 hashes)
4. Verification checks run
5. Requester accepts/rejects
6. Escrow releases on acceptance, stake returned
7. On rejection without dispute: stake returned (benefit of doubt)
8. On dispute loss: stake slashed (split between requester and platform)

### Worker Staking
Workers must stake a percentage of the bounty when claiming a task:
- **Base stake**: 15% of bounty
- **Min stake**: 5% (for high-reputation workers with score >= 90)
- **Max stake**: 30% (for repeat offenders)
- **Strike penalty**: +2% per strike on worker record
- **Resolution**: Stake returned on success/rejection, slashed on dispute loss

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
- Escrow, Stake, LedgerEntry, ChainEvent

## API Routes

```
POST /v1/auth/register, /login, /siwe/nonce, /siwe/verify
GET  /v1/auth/me
POST /v1/auth/wallet/link, /api-tokens

GET  /v1/tasks (filters: status, template, bbox, bounty)
POST /v1/tasks, /v1/tasks/:id/publish, /cancel
GET  /v1/tasks/:id/stake-info - Get required stake for claiming
POST /v1/tasks/:id/claim, /unclaim

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

# Escrow & Staking (mock for dev, onchain for prod)
ESCROW_PROVIDER="mock"
STAKING_PROVIDER="mock"
CHAIN_ID="84532"
BASE_RPC_URL="https://sepolia.base.org"
ESCROW_CONTRACT_ADDRESS="0x..."
STAKING_CONTRACT_ADDRESS="0x..."
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
- Public user profiles with reputation display
- Review system for post-task feedback

### Session History

#### Session 4: Public User Profiles & Reviews (Jan 28, 2026)

**New API Endpoints** (`packages/api/src/routes/users.ts`):
- `GET /v1/users/:usernameOrId` - Public profile data
- `GET /v1/users/:usernameOrId/stats` - Public stats (completed tasks, no earnings)
- `GET /v1/users/:usernameOrId/reviews` - Reviews/ratings from others
- `GET /v1/users/:usernameOrId/badges` - Earned badges
- `POST /v1/users/:usernameOrId/reviews` - Submit a review (auth required)
- `GET /v1/users/:usernameOrId/can-review/:taskId` - Check if can review

**Database Changes:**
- Added `Review` model to Prisma schema (rating, comment, reviewer/reviewee, task)

**New Frontend Components:**
- `packages/web/src/components/PublicProfileCard.tsx` - Compact card for listings
- `packages/web/src/components/BadgeShowcase.tsx` - Grid of earned badges
- `packages/web/src/components/ReviewList.tsx` - List of reviews with ratings
- `packages/web/src/components/ReputationMeter.tsx` - Visual reliability score
- `packages/web/src/components/ReviewSubmitForm.tsx` - Star rating form

**New Pages:**
- `packages/web/src/app/users/[username]/page.tsx` - Public profile page with SEO
- `packages/web/src/app/dashboard/worker/history/page.tsx` - Submission history with reviews

**Integration:**
- Task cards show requester profile (worker dashboard)
- Submission cards show worker profile (requester task detail)
- Review prompts after task completion (both requester and worker)
- Profile links from dashboard settings

**Files Modified:**
- `packages/api/prisma/schema.prisma` - Added Review model
- `packages/api/src/index.ts` - Registered users routes
- `packages/api/src/middleware/auth.ts` - Added optionalAuth middleware
- `packages/api/src/routes/tasks.ts` - Include requester/worker info in responses
- `packages/web/src/lib/api.ts` - Added user profile API methods
- `packages/web/src/app/dashboard/profile/page.tsx` - Link to public profile
- `packages/web/src/app/dashboard/worker/page.tsx` - Show requester cards
- `packages/web/src/app/dashboard/requester/tasks/[taskId]/page.tsx` - Worker cards + reviews

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
- **Token blacklist**: Logout actually invalidates tokens via Redis
- **JWT secret enforcement**: Production requires 32+ char secret
- **Automatic token refresh**: Frontend handles 401s transparently

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

#### Session 4: Authentication Security Hardening (Jan 28, 2026)

**Token Blacklist System (Redis-backed):**
- Created `packages/api/src/services/tokenBlacklist.ts`
  - `blacklistToken()` - Blacklist a JWT access token
  - `blacklistRefreshToken()` - Blacklist a refresh token
  - `isTokenBlacklisted()` - Check if token is revoked
  - `isRefreshTokenBlacklisted()` - Check refresh token status
  - `blacklistAllUserTokens()` - Invalidate all user sessions (password change)
  - `wasTokenInvalidatedForUser()` - Check user-wide invalidation
  - TTL-based storage (tokens auto-expire from blacklist when JWT expires)

**Real Logout Implementation:**
- `POST /v1/auth/logout` - Blacklists both access and refresh tokens
- `POST /v1/auth/logout-all` - Invalidates all user sessions across devices
- Auth middleware now checks blacklist before allowing requests

**JWT Secret Enforcement:**
- Production mode (NODE_ENV=production):
  - Fatal error if JWT_SECRET not set
  - Fatal error if JWT_SECRET < 32 characters
- Development/test mode:
  - Warning logged if using fallback secret
  - Insecure fallback only for local development

**Automatic Token Refresh (Frontend):**
- Updated `packages/web/src/lib/api.ts` with smart refresh logic
  - On 401 response: automatically tries token refresh
  - Retries original request with new token
  - Deduplicates concurrent refresh attempts
  - Dispatches `sessionExpiredEvent` when refresh fails
- New helper methods:
  - `setTokens()` - Store both tokens after login
  - `clearTokens()` - Clear all tokens on logout
  - `logout()` - Server-side invalidation + local cleanup
  - `logoutAll()` - Invalidate all user devices
  - `onSessionExpiry()` - Register callback for session timeout
- Tokens auto-persist to localStorage

**Security Improvements:**
- JWT tokens now include `jti` (JWT ID) for precise blacklisting
- Refresh tokens are one-time-use (blacklisted after use)
- User-wide session invalidation for password changes
- `optionalAuth` middleware for public routes with optional auth

**Files Created:**
- `packages/api/src/services/tokenBlacklist.ts` - Token blacklist service

**Files Modified:**
- `packages/api/src/middleware/auth.ts`
  - JWT secret validation with production enforcement
  - Token blacklist checks in authenticate middleware
  - Added `jti` to generated tokens
  - New `getJwtSecretForSigning()` export
  - New `optionalAuth` middleware
- `packages/api/src/routes/auth.ts`
  - Real logout with token blacklisting
  - New `/logout-all` endpoint
  - Refresh token one-time-use enforcement
  - Fixed JSON parsing for Prisma Json types
- `packages/web/src/lib/api.ts`
  - Automatic 401 retry with token refresh
  - Token storage in localStorage
  - Session expiry event dispatching
  - logout() and logoutAll() methods

**Environment Variables:**
- `JWT_SECRET` - Required in production (>=32 chars)
- `REDIS_URL` - Required for token blacklist (optional in dev)

**Testing Checklist:**
1. Login stores both tokens in localStorage
2. Logout invalidates tokens on server
3. Expired tokens trigger automatic refresh
4. Failed refresh redirects to login
5. logout-all invalidates all user sessions
6. Production startup fails without JWT_SECRET

#### Session 5: Component Library & UI Polish (Jan 28, 2026)

**New Component Library (`packages/web/src/components/ui/`):**
Created a comprehensive, reusable UI component library with Tailwind CSS styling:

- **Button.tsx** - Primary, secondary, ghost, danger variants; sm, md, lg sizes; loading state; icons
- **Card.tsx** - CardHeader, CardBody, CardFooter; default, glass, elevated variants; hoverable option
- **Modal.tsx** - Animated modal with backdrop, escape/click-to-close, sizes sm-full
- **Badge.tsx** - Success, warning, error, info variants; dot indicator; removable
- **Alert.tsx** - Dismissible alerts with icons; info, success, warning, error variants
- **Spinner.tsx** - Loading spinner with sizes sm-xl; optional label
- **Input.tsx** - Form input with label, error, hint; left/right icons; password visibility toggle
- **Select.tsx** - Dropdown select with label, error, hint; options array
- **Textarea.tsx** - Multi-line input with label, error, hint
- **Skeleton.tsx** - Loading placeholders; text, circular, rectangular variants; SkeletonCard, SkeletonTable
- **Toast.tsx** - ToastProvider + useToast hook; stacked notifications; auto-dismiss
- **EmptyState.tsx** - Empty state with icon, title, description, action; pre-built variants (EmptyTaskList, EmptySearchResults, etc.)
- **AnimatedContainer.tsx** - Framer Motion wrappers: PageTransition, FadeIn, SlideUp, StaggeredList, HoverScale, Pulse
- **MobileNav.tsx** - Slide-out drawer navigation for mobile; closes on route change

**Framer Motion Animations:**
- Installed `framer-motion` package
- Page transitions (fade + slide up)
- Card hover effects (lift + shadow)
- Modal enter/exit animations (scale + fade)
- Staggered list animations for cards/grids
- Button press feedback (scale on tap)
- Toast notifications (slide in/out)

**Mobile Navigation:**
- Added hamburger menu icon visible on mobile (lg:hidden)
- Slide-out drawer with spring animation
- Navigation items with icons
- Active route highlighting
- Closes on route change and escape key
- Updated dashboard layout with MobileNav component

**Updated Pages:**
- Home page: Mobile menu, staggered animations on "How It Works" and "Use Cases" sections
- Dashboard layout: Mobile navigation drawer, Spinner component for loading
- Admin disputes page: Alert, Spinner, Card, EmptyDisputeList components
- Requester page: StaggeredList, HoverScale, EmptyTaskList imports
- Worker page: StaggeredList, HoverScale, EmptySearchResults imports

**Files Created:**
- `packages/web/src/components/ui/Button.tsx`
- `packages/web/src/components/ui/Card.tsx`
- `packages/web/src/components/ui/Modal.tsx`
- `packages/web/src/components/ui/Badge.tsx`
- `packages/web/src/components/ui/Alert.tsx`
- `packages/web/src/components/ui/Spinner.tsx`
- `packages/web/src/components/ui/Input.tsx`
- `packages/web/src/components/ui/Select.tsx`
- `packages/web/src/components/ui/Textarea.tsx`
- `packages/web/src/components/ui/Skeleton.tsx`
- `packages/web/src/components/ui/Toast.tsx`
- `packages/web/src/components/ui/EmptyState.tsx`
- `packages/web/src/components/ui/AnimatedContainer.tsx`
- `packages/web/src/components/ui/MobileNav.tsx`
- `packages/web/src/components/ui/index.ts` - Barrel export

**Files Modified:**
- `packages/web/package.json` - Added framer-motion dependency
- `packages/web/src/app/globals.css` - Added shimmer animation for skeleton
- `packages/web/src/app/layout.tsx` - Added ToastProvider wrapper
- `packages/web/src/app/page.tsx` - Mobile menu, staggered animations
- `packages/web/src/app/dashboard/layout.tsx` - MobileNav, Spinner
- `packages/web/src/app/dashboard/admin/disputes/page.tsx` - Alert, Spinner, EmptyDisputeList
- `packages/web/src/app/dashboard/requester/page.tsx` - UI component imports
- `packages/web/src/app/dashboard/worker/page.tsx` - UI component imports

**New Dependencies:**
- `framer-motion` ^11.x - Animation library

**Usage Examples:**
```tsx
import { Button, Card, CardBody, Modal, Toast, useToast, Spinner, Alert, Badge, Input, Select, StaggeredList, StaggeredItem } from '@/components/ui';

// Button variants
<Button variant="primary" size="lg" isLoading>Submit</Button>
<Button variant="danger" leftIcon={<TrashIcon />}>Delete</Button>

// Toast notifications
const { success, error } = useToast();
success('Task created!', 'Your task is now live.');

// Animated lists
<StaggeredList staggerDelay={0.1}>
  {items.map(item => (
    <StaggeredItem key={item.id}>
      <Card hoverable>...</Card>
    </StaggeredItem>
  ))}
</StaggeredList>

// Form fields
<Input label="Email" error={errors.email} type="email" />
<Select label="Status" options={statusOptions} />
```

**Known Issues:**
- React-leaflet has TypeScript compatibility issues with React 19 (pre-existing)
- Build passes but type checking shows ForwardRef warnings for map components

#### Session 6: Multi-Tier Dispute Resolution (Jan 28, 2026)

**Tier System Overview:**
- **Tier 1 (Auto)**: Automated scoring based on verification checks - instant
- **Tier 2 (Jury)**: Community jury panel (5 jurors, stake-weighted) - 48hr window
- **Tier 3 (Admin)**: Final admin appeal (requires 10% bounty stake) - 72hr window

**Database Schema Changes (`packages/api/prisma/schema.prisma`):**
- Added to Dispute model:
  - `currentTier` (Int, default 1) - Current resolution tier
  - `tierHistory` (Json) - Array of tier transitions with timestamps
  - `autoScoreResult` (Json) - Tier 1 automated scoring result
  - `tier1Deadline`, `tier2Deadline`, `tier3Deadline` (DateTime) - Tier deadlines
  - `escalatedAt` (DateTime) - Last escalation timestamp
  - `escalationStake` (Float) - Appeal stake for Tier 3
- New DisputeJuror model:
  - `disputeId`, `jurorId` - Links juror to dispute
  - `vote` (String) - worker/requester/abstain
  - `weight` (Float) - Stake-weighted voting power
  - `reason` (Text) - Optional vote explanation
  - `selectedAt`, `votedAt`, `notifiedAt` (DateTime)
- Added User relation: `juryDuties DisputeJuror[]`

**API Endpoints (`packages/api/src/routes/disputes.ts`):**
- `GET /v1/disputes/jury-pool` - Get user's pending jury duties
- `POST /v1/disputes/:id/start-tier1` - Start Tier 1 auto-scoring
- `POST /v1/disputes/:id/process-tier1` - Process auto-score (admin)
- `POST /v1/disputes/:id/vote` - Cast jury vote (Tier 2)
- `POST /v1/disputes/:id/escalate` - Escalate to next tier
- `GET /v1/disputes/:id/jury-status` - Get jury voting status
- `POST /v1/disputes/:id/admin-appeal` - Resolve Tier 3 appeal (admin)
- `GET /v1/disputes/:id/tier-history` - Get full tier transition history

**Disputes Service (`packages/api/src/services/disputes.ts`):**
- `runTier1AutoScore()` - Automated verification checks:
  - Verification score (30% weight)
  - Artefact count (15% weight)
  - GPS location (25% weight)
  - Submission timing (15% weight)
  - Image quality (15% weight)
- `processTier1Result()` - Auto-resolve or escalate based on score
  - Score >= 80%: Worker wins
  - Score <= 20%: Requester wins
  - Otherwise: Escalate to Tier 2
- `escalateToTier2()` - Select 5 jurors (>90 reliability), set 48hr deadline
- `castJuryVote()` - Record juror vote with weight
- `checkJuryVotingComplete()` - Finalize when all voted or deadline
- `escalateToTier3()` - Appeal with stake (10% of bounty)
- `resolveAdminAppeal()` - Admin final decision
- `resolveDispute()` - Common resolution logic with notifications
- `getJuryStatus()` - Get current jury voting state
- `getJuryPoolForUser()` - Get user's pending jury duties

**Background Job (`packages/api/src/jobs/dispute-tier-deadline.ts`):**
- Runs every 5 minutes via BullMQ
- Processes expired tier deadlines:
  - Tier 1: Auto-score and resolve/escalate
  - Tier 2: Finalize jury voting when deadline passes
  - Tier 3: Auto-uphold previous decision if admin doesn't respond
- Registered in `packages/api/src/jobs/index.ts`
- Queue name: `DISPUTE_DEADLINE`

**Notification Types (`packages/api/src/services/notifications.ts`):**
- `dispute_escalated` - When dispute moves to higher tier
- `jury_duty` - When user is selected as juror
- `notifyDisputeEscalated()` - Notify parties of tier change
- `notifyJuryDuty()` - Notify juror of selection with deadline

**Frontend - Jury Pages:**
- `packages/web/src/app/dashboard/jury/page.tsx` - Jury duty pool
  - Lists user's pending jury assignments
  - Shows deadline countdown, task info, bounty
  - Visual indicators for urgent deadlines
- `packages/web/src/app/dashboard/jury/[disputeId]/page.tsx` - Jury voting
  - Task requirements and submission details
  - Evidence from both parties
  - Vote options: Worker wins / Requester wins / Abstain
  - Optional reason field
  - Voting progress indicator

**Frontend - Admin Dispute Page Updates:**
- Updated `packages/web/src/app/dashboard/admin/disputes/[disputeId]/page.tsx`
  - Tier progress bar (1 -> 2 -> 3) with status indicators
  - Auto-score result display (checks, scores, recommendation)
  - Jury voting status (votes cast, weights, deadline)
  - Tier history timeline
  - New status badges for tier1_review, tier2_voting, tier3_appeal

**Files Created:**
- `packages/api/src/services/disputes.ts`
- `packages/api/src/jobs/dispute-tier-deadline.ts`
- `packages/web/src/app/dashboard/jury/page.tsx`
- `packages/web/src/app/dashboard/jury/[disputeId]/page.tsx`

**Files Modified:**
- `packages/api/prisma/schema.prisma` - New fields, DisputeJuror model
- `packages/api/src/routes/disputes.ts` - Multi-tier endpoints
- `packages/api/src/services/notifications.ts` - Escalation/jury notifications
- `packages/api/src/lib/queue.ts` - DISPUTE_DEADLINE queue
- `packages/api/src/jobs/index.ts` - Register dispute deadline job
- `packages/web/src/app/dashboard/admin/disputes/[disputeId]/page.tsx` - Tier UI

**After Schema Changes:**
Run `npm run db:generate` to regenerate Prisma client before starting API.

