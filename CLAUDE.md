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

- **Backend**: Express.js, Prisma (SQLite dev / Postgres prod), Zod validation
- **Frontend**: Next.js 14, React 18, Tailwind CSS, Zustand, React Query
- **Web3**: wagmi, viem, SIWE auth, ethers.js
- **Blockchain**: Base (L2), USDC escrow, Hardhat

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
- [ ] Production database migration (PostgreSQL ready, using SQLite for dev)
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

### Recently Fixed (This Session)

#### 1. Removed Legacy Role System from Worker Routes
**Problem**: Claims, submissions, and upload routes required `role: worker` which blocked users since all accounts are unified.

**Solution**: Removed `requireRole('worker')` middleware from:
- `packages/api/src/routes/claims.ts` - GET /claims, POST /claim, POST /unclaim
- `packages/api/src/routes/submissions.ts` - all submission routes
- `packages/api/src/routes/uploads.ts` - file upload route

**Note**: `requireRole('admin')` kept for dispute resolution routes (correct behavior).

#### 2. Fixed Task Creation Validation Error
**Problem**: Form state was being reset on every render due to side-effect in render function that set default dates.

**Solution** in `packages/web/src/app/dashboard/requester/new/page.tsx`:
- Moved `getDefaultDates()` helper outside component
- Initialize `useState` with proper defaults including dates
- Added client-side validation before API call (title ≥5 chars, instructions ≥10 chars)
- Shows helpful error and returns to step 1 if validation fails

#### 3. Fixed White-on-White Text Issues (Light Theme Migration)
**Problem**: Many pages had dark theme colors (`text-white`, `text-zinc-*`) on light backgrounds.

**Files Fixed**:
- `packages/web/src/app/page.tsx` (homepage) - all headings, text, buttons
- `packages/web/src/app/not-found.tsx` - 404 page
- `packages/web/src/app/(auth)/login/page.tsx` - login form
- `packages/web/src/app/(auth)/register/page.tsx` - register form
- All dashboard pages (requester, worker, admin, settings, profile, etc.)

**Color Mapping Applied**:
- `text-white` → `text-slate-800` (except on colored button backgrounds)
- `text-zinc-300/400/500` → `text-slate-500/600`
- `text-gray-*` → `text-slate-*` (consistency)
- `bg-white shadow-sm` → `glass rounded-lg border border-surface-200`
- `bg-blue-600` → `bg-field-500` (teal brand color)
- `hover:bg-white/10` → `hover:bg-field-50`

#### 4. Removed Legacy Role Links
**Problem**: Homepage had `/register?role=requester` and `/register?role=worker` links.

**Solution**: Changed to just `/register` since accounts are unified.

### Known Issues Remaining
- WalletConnect SSR warnings (indexedDB not defined) - cosmetic, doesn't affect client
- WalletConnect needs valid project ID from https://cloud.walletconnect.com

### Architecture Notes

#### Unified Account Model
All users can both post tasks (requester) AND claim/complete tasks (worker). The legacy `role` field in the database still exists but is not enforced on routes. The only role-based restriction is `admin` for dispute resolution.

#### Color System (Light Theme)
- **Primary**: `field-500` (#14b8a6) - teal
- **Text**: `slate-800` (headings), `slate-600` (body), `slate-500` (muted)
- **Surfaces**: `bg-surface` (white), `bg-surface-50` (off-white), `glass` (glassmorphism)
- **Borders**: `border-surface-200/300`

### Quick Resume Checklist
1. Start API: `npm run dev:api` (must be running first)
2. Start Web: `npm run dev:web`
3. Open: http://localhost:3001
4. Test flow: Register → Dashboard → Create Task (fill all fields!) → Browse Tasks → Claim → Submit

### Next Priority Items
- [ ] Add map view for task locations
- [ ] Mobile responsive improvements
- [ ] Test full task flow end-to-end
- [ ] Production database migration (PostgreSQL)

