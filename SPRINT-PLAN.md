# Field Network Sprint Plan

## Current State Summary

**Completed:**
- User auth (email + SIWE wallet)
- Task CRUD, claiming, submission flow
- Proof bundle generation with SHA256 hashes
- Mock escrow provider (swappable)
- Mock object storage (local files)
- Basic verification (GPS, bearing, duplicates, image dimensions)
- EXIF metadata extraction
- On-chain escrow provider (viem)
- Smart contract (GroundTruthEscrow.sol)
- CI/CD with GitHub Actions
- Light theme UI
- **Reputation service** (packages/api/src/services/reputation.ts) - scoring, badges, streaks
- **Fee service** (packages/api/src/services/fees.ts) - tiered fees, calculation
- **Badge system** - 19 badge definitions covering milestones, quality, streaks

**Remaining:**
- Production database (PostgreSQL)
- Production storage (S3/R2)
- Contract deployment to mainnet
- Dispute flow UX enforcement
- Admin dashboard
- Notification system
- Enhanced dashboards with maps
- Mobile responsiveness

---

## Sprint 1: Production Database & Infrastructure

**Goal:** Migrate from SQLite to PostgreSQL with production-ready database configuration and job infrastructure.

**Demo:** Application runs against PostgreSQL locally and in Docker; background jobs process expired claims.

**Definition of Done:**
- [ ] All API tests pass against PostgreSQL
- [ ] Docker Compose starts full stack (API + DB + job worker)
- [ ] Health endpoint shows database and job queue status
- [ ] Seed data populates correctly

### Tasks

#### 1.1 PostgreSQL Local Development Setup
- **Description:** Configure local PostgreSQL for development alongside existing SQLite.
- **Files:** `docker-compose.yml`, `packages/api/.env.example`
- **Validation:**
  - `docker-compose up db` starts PostgreSQL on port 5432
  - Connection string `postgresql://field:field@localhost:5432/field` works with Prisma
  - Existing tests continue to pass (using SQLite for test env)

#### 1.2 Prisma Schema PostgreSQL Compatibility Audit
- **Description:** Review schema for PostgreSQL-specific considerations (e.g., `@db.Text` for long strings, enum handling, JSON fields).
- **Files:** `packages/api/prisma/schema.prisma`
- **Validation:**
  - `npx prisma validate` passes
  - `npx prisma db push` succeeds against PostgreSQL
  - All JSON fields use `Json` type with proper defaults

#### 1.3 Database Migration Script
- **Description:** Create initial migration from current schema state with rollback support.
- **Files:** `packages/api/prisma/migrations/`
- **Validation:**
  - `npx prisma migrate dev --name init` creates migration
  - `npx prisma migrate deploy` applies it
  - Down migration exists and works (manual verification)

#### 1.4 Seed Script for Development Data
- **Description:** Create seed script with test users (admin, requester, worker), tasks in various states, and sample submissions.
- **Files:** `packages/api/prisma/seed.ts`, `package.json` (prisma.seed config)
- **Validation:**
  - `npx prisma db seed` completes without error
  - API returns seeded users via `/v1/auth/me` after login
  - At least 10 tasks, 5 submissions, 3 users created

#### 1.5 Environment-Based Database URL Switching
- **Description:** Configure API to use SQLite for `NODE_ENV=test`, PostgreSQL otherwise.
- **Files:** `packages/api/src/lib/prisma.ts`, `.env.example`, `.env.test`
- **Validation:**
  - `npm test` uses SQLite (fast, isolated)
  - `npm run dev` uses PostgreSQL
  - No cross-contamination between environments

#### 1.6 Database Connection Pooling Configuration
- **Description:** Add connection pooling settings for production (pool size, timeout).
- **Files:** `packages/api/src/lib/prisma.ts`
- **Validation:**
  - Using `autocannon`, sustain 50 concurrent requests for 60 seconds to `/health`
  - Database connections stay under configured `connection_limit` (default: 10)
  - p99 response time under 500ms
  - No `PrismaClientKnownRequestError` with code P1017

#### 1.7 Health Check Endpoint with Database Probe
- **Description:** Extend `/health` to include database connectivity and job queue status.
- **Files:** `packages/api/src/routes/health.ts`
- **Validation:**
  - `/health` returns `{ status: 'ok', db: 'connected', jobs: 'connected' }`
  - Returns 503 with `{ status: 'degraded', db: 'error' }` when DB is down

#### 1.8 Background Job Infrastructure (Bull + Redis)
- **Description:** Set up Bull queue with Redis for scheduled tasks (claim expiry, notification delivery).
- **Files:** `packages/api/src/lib/queue.ts`, `packages/api/src/jobs/index.ts`, `docker-compose.yml` (add redis)
- **Validation:**
  - `docker-compose up redis` starts Redis
  - Job can be enqueued and processed
  - Failed jobs retry with exponential backoff

#### 1.9 Claim Expiry Job Implementation
- **Description:** Implement scheduled job to expire claims past TTL and update worker reputation.
- **Files:** `packages/api/src/jobs/claim-expiry.ts`
- **Validation:**
  - Job runs every 5 minutes
  - Expired claims marked as `expired`
  - Worker reliability score reduced by 5 points per abandonment
  - Streak counter resets to 0

#### 1.10 Automated PostgreSQL Backup Configuration
- **Description:** Configure automated backups with point-in-time recovery (PITR) documentation.
- **Files:** `docker-compose.yml` (backup volume), `docs/BACKUP.md`
- **Validation:**
  - Backup script creates timestamped dump
  - Restore to new database succeeds
  - Data integrity verified (row counts match)

#### 1.11 Data Migration Script (SQLite to PostgreSQL)
- **Description:** Create migration script for existing development data.
- **Files:** `scripts/migrate-sqlite-to-postgres.ts`
- **Validation:**
  - All users, tasks, and submissions transfer correctly
  - Foreign keys intact
  - UUIDs preserved

#### 1.12 Integration Tests for Database Layer
- **Description:** Add integration tests for critical database operations.
- **Files:** `packages/api/tests/integration/database.test.ts`
- **Validation:**
  - User creation, task lifecycle, submission flow tested
  - Tests pass in CI against PostgreSQL service

---

## Sprint 2: Production Object Storage

**Goal:** Replace mock file storage with S3-compatible object storage using signed URLs.

**Demo:** File uploads go to S3/MinIO; signed URLs work for secure download; existing flow unchanged.

**Definition of Done:**
- [ ] Artefact upload creates S3 object
- [ ] Download redirects to signed URL
- [ ] MinIO works for local development
- [ ] All upload/download tests pass

### Tasks

#### 2.1 Storage Provider Interface Definition
- **Description:** Define TypeScript interface for storage providers (upload, download, delete, getSignedUrl).
- **Files:** `packages/api/src/services/storage/types.ts`
- **Validation:**
  - Interface compiles
  - JSDoc documents all methods and parameters
  - Return types include error handling

#### 2.2 Local Storage Provider Refactor
- **Description:** Refactor existing local file storage to implement the new interface.
- **Files:** `packages/api/src/services/storage/local.ts`
- **Validation:**
  - Existing upload tests pass unchanged
  - Implements `StorageProvider` interface
  - `getSignedUrl` returns file:// URL for local dev

#### 2.3 S3 Storage Provider with Signed URLs
- **Description:** Implement S3-compatible storage provider using AWS SDK v3 with pre-signed URL generation.
- **Files:** `packages/api/src/services/storage/s3.ts`
- **Validation:**
  - Unit tests mock S3 client
  - Upload creates object with correct content-type
  - Signed URL with 1-hour expiry returns 200 when accessed immediately
  - Same URL returns 403 after TTL expires
  - URL contains `X-Amz-Signature` parameter
  - Objects created with server-side encryption enabled

#### 2.4 Storage Provider Factory
- **Description:** Create factory that returns storage provider based on `STORAGE_PROVIDER` env var.
- **Files:** `packages/api/src/services/storage/index.ts`
- **Validation:**
  - `STORAGE_PROVIDER=local` returns LocalStorageProvider
  - `STORAGE_PROVIDER=s3` returns S3StorageProvider
  - Missing provider throws descriptive error

#### 2.5 MinIO Docker Configuration
- **Description:** Add MinIO to docker-compose for local S3-compatible testing with CORS configured.
- **Files:** `docker-compose.yml`, `.env.example`, `scripts/init-minio.sh`
- **Validation:**
  - `docker-compose up minio` starts MinIO on port 9000
  - Console accessible at port 9001
  - S3 provider works against MinIO
  - Browser can upload directly to signed URL without CORS errors

#### 2.6 Artefact Upload Route Update
- **Description:** Update artefact upload to use storage provider; store bucket/key instead of local path.
- **Files:** `packages/api/src/routes/uploads.ts`, `packages/api/prisma/schema.prisma` (add bucket, key fields)
- **Validation:**
  - Upload creates S3 object
  - Artefact record contains bucket/key
  - Migration adds new fields with defaults for existing records

#### 2.7 Artefact Download Route with Signed URLs
- **Description:** Update download route to redirect to signed URL instead of serving file directly.
- **Files:** `packages/api/src/routes/artefacts.ts`
- **Validation:**
  - GET `/artefacts/:id/download` returns 302 redirect
  - Location header contains signed S3 URL
  - Direct file serving still works for local provider

#### 2.8 Storage Integration Tests
- **Description:** Integration tests for full upload/download flow with MinIO.
- **Files:** `packages/api/tests/integration/storage.test.ts`
- **Validation:**
  - Tests pass using MinIO container
  - Upload, download, delete, signed URL generation all tested
  - Bucket policy denies public access (verified in test)

#### 2.9 E2E Test: Complete Task Lifecycle with Storage
- **Description:** End-to-end test covering create task -> fund -> claim -> upload artefact -> submit -> accept -> download.
- **Files:** `packages/api/tests/e2e/task-lifecycle.test.ts`
- **Validation:**
  - Full flow completes successfully
  - Uploaded file downloadable via signed URL
  - Escrow released on acceptance

---

## Sprint 3: Admin Dashboard & Dispute Resolution

**Goal:** Build admin dashboard for task moderation and dispute resolution with enforced workflow.

**Demo:** Admin can view disputes, review evidence (images via signed URLs), resolve with split decisions, and see audit log.

**Definition of Done:**
- [ ] Admin can list and filter disputes
- [ ] Admin can view submission evidence
- [ ] Admin can resolve disputes (full or split)
- [ ] Escrow releases correctly based on outcome
- [ ] Audit log tracks all actions

### Tasks

#### 3.1 Admin Authentication Hardening
- **Description:** Implement admin-specific security (session limits, IP logging, audit trail).
- **Files:** `packages/api/src/middleware/auth.ts`, `packages/api/src/routes/admin.ts`
- **Validation:**
  - Admin login logged with IP address
  - Session expires after 1 hour of inactivity
  - Non-admin users get 403 on admin routes
  - Failed admin login attempts logged

#### 3.2 Dispute List API Endpoint
- **Description:** GET `/v1/admin/disputes` with filtering (status, date range) and pagination.
- **Files:** `packages/api/src/routes/admin.ts`
- **Validation:**
  - Returns paginated disputes (default 20 per page)
  - Filters: `?status=pending`, `?from=2024-01-01&to=2024-12-31`
  - Total count included in response

#### 3.3 Dispute Detail API Endpoint
- **Description:** GET `/v1/admin/disputes/:id` returns dispute with submission, task, users, and evidence.
- **Files:** `packages/api/src/routes/admin.ts`
- **Validation:**
  - Returns full dispute context including artefact signed URLs
  - 404 for non-existent disputes
  - Includes both requester and worker profiles

#### 3.4 Dispute Resolution API - Schema Update
- **Description:** Add split percentage field to Dispute model and resolution API.
- **Files:** `packages/api/prisma/schema.prisma`, `packages/api/src/routes/admin.ts`
- **Validation:**
  - `splitPercentage` field added (nullable, 0-100)
  - POST `/v1/admin/disputes/:id/resolve` accepts `outcome`, `reason`, `splitPercentage`
  - Validation: split percentage only allowed when outcome is 'split'

#### 3.5 Dispute Resolution API - Escrow Split Logic
- **Description:** Implement split payment calculation in escrow service.
- **Files:** `packages/api/src/services/escrow.ts`, `packages/api/src/services/disputes.ts`
- **Validation:**
  - `outcome: 'worker_wins'` releases 100% to worker
  - `outcome: 'requester_wins'` refunds 100% to requester
  - `outcome: 'split', splitPercentage: 70` releases 70% to worker, 30% to requester
  - Split calculations verified with 10+ edge cases (0%, 100%, 50%, fractional amounts)
  - Property-based test: split amounts always sum to original bounty

#### 3.6 Dispute Resolution API - Integration Tests
- **Description:** Integration tests for all dispute resolution scenarios.
- **Files:** `packages/api/tests/integration/disputes.test.ts`
- **Validation:**
  - All three outcomes tested
  - Split edge cases covered
  - Second resolution attempt returns 400 'Dispute already resolved'
  - Escrow balances verified after resolution

#### 3.7 Dispute Audit Log
- **Description:** Log all dispute actions (created, evidence_added, resolved) with timestamps and actor.
- **Files:** `packages/api/prisma/schema.prisma` (DisputeAuditLog model), `packages/api/src/services/disputes.ts`
- **Validation:**
  - Resolution creates audit log entry with resolver ID, timestamp, outcome
  - Logs queryable by dispute ID via API
  - Evidence addition logged

#### 3.8 Storage Cleanup on Submission Rejection
- **Description:** Delete stored files when submission is rejected to avoid orphaned objects.
- **Files:** `packages/api/src/routes/submissions.ts`
- **Validation:**
  - Rejected submission's artefacts deleted from storage
  - Cleanup logged in audit trail
  - Graceful handling if storage delete fails

#### 3.9 Admin Dashboard Page Layout
- **Description:** Create admin dashboard layout with navigation (Disputes, Tasks, Users).
- **Files:** `packages/web/src/app/dashboard/admin/layout.tsx`
- **Validation:**
  - Admin layout renders with sidebar navigation
  - Navigation links work
  - Shows admin badge in header

#### 3.10 Disputes List UI
- **Description:** Build disputes list page with status badges, filtering, and pagination.
- **Files:** `packages/web/src/app/dashboard/admin/disputes/page.tsx`
- **Validation:**
  - Displays disputes from API
  - Status badges color-coded (pending=yellow, resolved=green)
  - Filters update results without page reload
  - Pagination controls work

#### 3.11 Dispute Detail UI
- **Description:** Build dispute detail page showing submission evidence, task requirements, and user history.
- **Files:** `packages/web/src/app/dashboard/admin/disputes/[disputeId]/page.tsx`
- **Validation:**
  - Shows all evidence (images render via signed URLs)
  - Task requirements displayed
  - User reputation badges visible
  - Evidence images open in lightbox

#### 3.12 Dispute Resolution UI
- **Description:** Build resolution form with outcome selection, split percentage slider, and reason textarea.
- **Files:** `packages/web/src/app/dashboard/admin/disputes/[disputeId]/page.tsx`
- **Validation:**
  - Form shows outcome options (Worker Wins, Requester Wins, Split)
  - Split percentage slider appears only for Split outcome
  - Reason field required (min 20 characters)
  - Success redirects to disputes list with toast

#### 3.13 Task Moderation List UI
- **Description:** Build task list for admins with ability to cancel/flag suspicious tasks.
- **Files:** `packages/web/src/app/dashboard/admin/tasks/page.tsx`
- **Validation:**
  - Admin can view all tasks with filters
  - Cancel action prompts confirmation
  - Cancelled tasks release escrow to requester

#### 3.14 Admin Dashboard E2E Tests
- **Description:** Playwright tests for dispute resolution flow.
- **Files:** `packages/web/tests/e2e/admin-disputes.spec.ts`
- **Validation:**
  - Test logs in as admin
  - Navigates to dispute
  - Resolves with split outcome
  - Verifies success message and escrow release

---

## Sprint 4: Reputation System Extensions & Notifications

**Goal:** Extend existing reputation system with history tracking and build notification infrastructure.

**Demo:** Users see reputation history graph; users receive in-app notifications for key events.

**Definition of Done:**
- [ ] Reputation history viewable in profile
- [ ] Badge unlock creates notification
- [ ] Notifications appear in dashboard header
- [ ] Notification preferences configurable

### Tasks

#### 4.1 Reputation History Database Model
- **Description:** Create ReputationEvent model to track score changes over time.
- **Files:** `packages/api/prisma/schema.prisma`
- **Validation:**
  - Migration adds ReputationEvent table
  - Fields: userId, previousScore, newScore, reason, taskId (optional), createdAt

#### 4.2 Reputation History Tracking
- **Description:** Update reputation service to log all score changes.
- **Files:** `packages/api/src/services/reputation.ts`
- **Validation:**
  - Task completion creates history entry
  - Dispute resolution creates history entry
  - Claim abandonment creates history entry
  - Badge unlock creates history entry

#### 4.3 Reputation History API
- **Description:** GET `/v1/users/:id/reputation-history` returns score changes over time.
- **Files:** `packages/api/src/routes/users.ts`
- **Validation:**
  - Returns paginated history (default 50 entries)
  - Each entry has reason, score change, timestamp
  - Public for all users (own detailed, others summary)

#### 4.4 Reputation Anti-Gaming Documentation
- **Description:** Document reputation system anti-gaming measures.
- **Files:** `docs/REPUTATION.md`
- **Validation:**
  - Documents Sybil resistance measures
  - Rate limits on self-dealing explained
  - Dispute abuse detection described

#### 4.5 Notification Database Schema
- **Description:** Create Notification model for in-app notifications.
- **Files:** `packages/api/prisma/schema.prisma`
- **Validation:**
  - Fields: userId, type, title, body, read, data (JSON), createdAt
  - Index on userId + read for unread query

#### 4.6 Notification Service Implementation
- **Description:** Create notification service for creating and querying notifications.
- **Files:** `packages/api/src/services/notifications.ts`
- **Validation:**
  - `createNotification(userId, type, title, body, data)` works
  - `getUnreadCount(userId)` returns correct count
  - `markAsRead(notificationId)` updates status

#### 4.7 Notification API Endpoints
- **Description:** Create notification CRUD endpoints.
- **Files:** `packages/api/src/routes/notifications.ts`
- **Validation:**
  - GET `/v1/notifications` returns paginated notifications
  - GET `/v1/notifications/unread-count` returns count
  - POST `/v1/notifications/:id/read` marks as read
  - POST `/v1/notifications/read-all` marks all as read

#### 4.8 Notification Triggers
- **Description:** Add notification creation for key events (task claimed, submission received, dispute resolved, badge earned).
- **Files:** `packages/api/src/routes/claims.ts`, `packages/api/src/routes/submissions.ts`, `packages/api/src/services/disputes.ts`, `packages/api/src/services/reputation.ts`
- **Validation:**
  - Task claimed -> requester notified
  - Submission received -> requester notified
  - Submission accepted/rejected -> worker notified
  - Dispute resolved -> both parties notified
  - Badge earned -> user notified

#### 4.9 Notification Bell Component
- **Description:** Build notification bell in dashboard header with unread count badge.
- **Files:** `packages/web/src/components/NotificationBell.tsx`
- **Validation:**
  - Shows unread count (max "99+")
  - Click opens notification dropdown
  - Dropdown shows recent notifications
  - Click notification marks as read

#### 4.10 Notification Preferences
- **Description:** Add user notification preferences (which types to receive).
- **Files:** `packages/api/prisma/schema.prisma`, `packages/api/src/routes/profile.ts`, `packages/web/src/app/dashboard/profile/page.tsx`
- **Validation:**
  - User can toggle notification types
  - Preferences respected when creating notifications

#### 4.11 Reputation History UI
- **Description:** Build reputation history chart in user profile.
- **Files:** `packages/web/src/components/ReputationChart.tsx`, `packages/web/src/app/dashboard/profile/page.tsx`
- **Validation:**
  - Line chart shows score over time
  - Hover shows event details
  - Time range selector (week/month/all)

#### 4.12 Reputation Edge Case Tests
- **Description:** Add tests for reputation edge cases.
- **Files:** `packages/api/tests/unit/reputation.test.ts`
- **Validation:**
  - User with no completed tasks (no division by zero)
  - User with 100% dispute rate handled
  - Badge unlock race conditions prevented
  - Concurrent reputation updates handled correctly

---

## Sprint 5: Fee System UI & Transparency

**Goal:** Build UI for existing fee system with transparent display and admin reporting.

**Demo:** Users see fee breakdown before and after transactions; admin sees fee reports.

**Definition of Done:**
- [ ] Task creation shows fee preview
- [ ] Acceptance shows net payout
- [ ] Profile shows fees paid
- [ ] Admin dashboard shows fee metrics

### Tasks

#### 5.1 Fee Configuration via Database
- **Description:** Move fee configuration from code to database for admin adjustability.
- **Files:** `packages/api/prisma/schema.prisma`, `packages/api/src/services/fees.ts`
- **Validation:**
  - FeeConfig model stores base_fee_percent, trusted_fee_percent, reputation_threshold
  - Existing fee service reads from database
  - Fallback to defaults if no config

#### 5.2 Fee Ledger Entries
- **Description:** Record fee transactions in LedgerEntry table for accounting.
- **Files:** `packages/api/src/services/fees.ts`, `packages/api/prisma/schema.prisma`
- **Validation:**
  - Every fee deduction creates ledger entry
  - Entry includes: amount, userId, taskId, type='platform_fee'
  - Ledger entries queryable by admin

#### 5.3 Fee Preview API
- **Description:** GET `/v1/fees/preview?amount=X` returns fee breakdown for given amount.
- **Files:** `packages/api/src/routes/fees.ts`
- **Validation:**
  - Returns { gross, fee, feePercent, net } for current user
  - Fee percent varies by user reputation tier

#### 5.4 Fee Display on Task Creation
- **Description:** Show estimated fee breakdown when creating task.
- **Files:** `packages/web/src/app/dashboard/requester/new/page.tsx`
- **Validation:**
  - Fee preview updates as bounty input changes (debounced)
  - Shows "Total cost to you: $X (including $Y platform fee)"

#### 5.5 Fee Display on Payout
- **Description:** Show fee breakdown in submission acceptance confirmation.
- **Files:** `packages/web/src/app/dashboard/requester/tasks/[taskId]/page.tsx`
- **Validation:**
  - Acceptance modal shows: "Bounty: $X, Platform fee: $Y, Worker receives: $Z"
  - Confirm button shows net amount

#### 5.6 Fee History in User Profile
- **Description:** Show total fees paid in user profile/settings.
- **Files:** `packages/web/src/app/dashboard/profile/page.tsx`
- **Validation:**
  - Shows cumulative fees paid (lifetime)
  - Shows current fee tier and next tier threshold

#### 5.7 Admin Fee Dashboard
- **Description:** Admin view showing total fees collected, breakdown by tier, trends.
- **Files:** `packages/web/src/app/dashboard/admin/fees/page.tsx`
- **Validation:**
  - Shows total fees collected (all time, this month)
  - Breakdown by fee tier (standard vs. trusted)
  - Line chart of fees over time

#### 5.8 Fee Tier Notification
- **Description:** Notify user when they qualify for reduced fees.
- **Files:** `packages/api/src/services/reputation.ts`
- **Validation:**
  - Crossing reputation threshold triggers notification
  - Notification shows new fee rate

#### 5.9 Fee Calculation Edge Case Tests
- **Description:** Add tests for fee edge cases.
- **Files:** `packages/api/tests/unit/fees.test.ts`
- **Validation:**
  - Zero-amount transactions handled (no fee)
  - Micro-transactions below minimum fee handled
  - Fee tier boundary conditions tested
  - Rounding behavior consistent

---

## Sprint 6: Enhanced Dashboards & Maps

**Goal:** Build comprehensive dashboards with maps, stats, and visualizations.

**Demo:** Workers see earnings chart, completed tasks on map; Requesters see fulfillment stats.

**Definition of Done:**
- [ ] Worker dashboard shows stats and earnings chart
- [ ] Map shows completed task locations
- [ ] Requester dashboard shows task analytics
- [ ] Dashboards work on mobile

### Tasks

#### 6.1 Map Library Evaluation & Setup
- **Description:** Evaluate Leaflet vs Mapbox GL for task maps; set up chosen library.
- **Files:** `packages/web/package.json`, `packages/web/src/components/Map.tsx`
- **Validation:**
  - Library chosen based on: bundle size, features, cost
  - Basic map renders with marker
  - Bundle size increase documented (target: under 100KB gzipped)

#### 6.2 Worker Stats API Endpoint
- **Description:** GET `/v1/users/me/stats/worker` returns earnings and completion metrics.
- **Files:** `packages/api/src/routes/users.ts`
- **Validation:**
  - Returns `{ totalEarned, tasksCompleted, acceptanceRate, currentStreak, averageTaskValue }`
  - Values match direct database query within 1%
  - Response time under 200ms for users with up to 1000 completed tasks

#### 6.3 Requester Stats API Endpoint
- **Description:** GET `/v1/users/me/stats/requester` returns posting and fulfillment metrics.
- **Files:** `packages/api/src/routes/users.ts`
- **Validation:**
  - Returns `{ totalSpent, tasksPosted, fulfillmentRate, averageFulfillmentTime, activeTaskCount }`
  - Values accurate to database

#### 6.4 Worker Dashboard Stats Cards
- **Description:** Build stats cards showing lifetime earnings, tasks completed, current streak.
- **Files:** `packages/web/src/app/dashboard/worker/page.tsx`
- **Validation:**
  - Stats display from API
  - Loading states shown
  - Error states handled gracefully

#### 6.5 Earnings Chart Component
- **Description:** Build line chart showing earnings over time (daily/weekly/monthly).
- **Files:** `packages/web/src/components/EarningsChart.tsx`
- **Validation:**
  - Chart renders with correct data
  - Time range selector (7d, 30d, 90d, all)
  - Tooltip shows exact value on hover

#### 6.6 Completed Tasks Map Component
- **Description:** Build map component showing pins for completed tasks with clustering.
- **Files:** `packages/web/src/components/CompletedTasksMap.tsx`
- **Validation:**
  - Map renders with task location pins
  - Pins cluster at low zoom levels
  - Click pin shows task summary popup
  - Lazy-loaded to minimize initial bundle

#### 6.7 Worker Dashboard Integration
- **Description:** Integrate stats, earnings chart, and map into worker dashboard.
- **Files:** `packages/web/src/app/dashboard/worker/page.tsx`
- **Validation:**
  - All components render together
  - Responsive grid layout
  - Data loads in parallel

#### 6.8 Requester Dashboard Enhancement
- **Description:** Build requester dashboard with active bounties, fulfillment chart, spend summary.
- **Files:** `packages/web/src/app/dashboard/requester/page.tsx`
- **Validation:**
  - Active tasks list with status indicators
  - Fulfillment rate chart (completed vs posted over time)
  - Total spent summary

#### 6.9 Achievement Progress UI
- **Description:** Build achievement display showing earned badges and progress to next.
- **Files:** `packages/web/src/components/AchievementProgress.tsx`
- **Validation:**
  - Earned badges shown with unlock date
  - Next achievable badges with progress bar
  - Locked badges shown grayed

#### 6.10 Dashboard Mobile Responsiveness
- **Description:** Audit and improve dashboard mobile responsiveness.
- **Files:** `packages/web/src/app/dashboard/**/*.tsx`
- **Validation:**
  - Dashboard passes Lighthouse mobile audit with score >80
  - All features usable on 375px viewport
  - Touch targets minimum 44x44px
  - Charts readable on mobile

#### 6.11 Dashboard E2E Tests
- **Description:** E2E tests for dashboard data accuracy and interactions.
- **Files:** `packages/web/tests/e2e/dashboards.spec.ts`
- **Validation:**
  - Stats match expected values after known actions
  - Chart renders with data
  - Map loads and shows pins

---

## Sprint 7: Contract Deployment & Launch Readiness

**Goal:** Deploy smart contracts to Base mainnet and complete final production hardening.

**Demo:** Full end-to-end flow works on mainnet with real USDC escrow.

**Definition of Done:**
- [ ] Contract deployed and verified on Base mainnet
- [ ] Full flow works with real USDC
- [ ] Security scan passes
- [ ] Smoke tests pass on production
- [ ] Runbook and checklist complete

### Tasks

#### 7.1 Contract Upgrade Strategy Documentation
- **Description:** Document contract upgrade strategy and emergency procedures.
- **Files:** `docs/CONTRACT-OPERATIONS.md`
- **Validation:**
  - Pause mechanism documented
  - Upgrade path documented (if using proxy)
  - Emergency contact procedures listed

#### 7.2 Testnet Deployment and Soak Test
- **Description:** Deploy to Base Sepolia and run full integration suite for 7 days.
- **Files:** `packages/contracts/scripts/deploy.ts`
- **Validation:**
  - Contract deployed to Base Sepolia
  - Full E2E test suite passes against testnet
  - 7-day soak test with automated transactions
  - No unexpected failures or edge cases

#### 7.3 Contract Deployment Script for Base Mainnet
- **Description:** Update deploy script with mainnet RPC, gas settings, and verification.
- **Files:** `packages/contracts/scripts/deploy.ts`, `packages/contracts/hardhat.config.ts`
- **Validation:**
  - Script runs without error in dry-run mode
  - Gas estimation accurate within 20%
  - Deployment transaction simulated successfully

#### 7.4 Contract Verification on Basescan
- **Description:** Verify deployed contract source on Basescan for transparency.
- **Files:** `packages/contracts/scripts/verify.ts`
- **Validation:**
  - Contract shows "Verified" on Basescan
  - Source code readable
  - Matches audited bytecode (if audited)

#### 7.5 Operator Wallet Security Audit
- **Description:** Audit operator wallet setup; ensure key never logged or exposed.
- **Files:** `SECURITY.md`, `packages/api/src/services/escrow.ts`
- **Validation:**
  - Code review confirms no key exposure in logs
  - Key loaded from environment only
  - Documentation for secure key management complete

#### 7.6 Mainnet Escrow Provider Configuration
- **Description:** Configure API to use on-chain escrow with mainnet contract address.
- **Files:** `packages/api/src/services/escrow.ts`, `.env.production.example`
- **Validation:**
  - `ESCROW_PROVIDER=onchain` works with mainnet contract
  - Contract address matches deployed address
  - Chain ID set to 8453 (Base mainnet)

#### 7.7 USDC Token Configuration
- **Description:** Configure correct USDC token address for Base mainnet.
- **Files:** `packages/api/src/config/tokens.ts`
- **Validation:**
  - USDC address: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  - Test deposit/withdrawal with small amount

#### 7.8 Transaction Monitoring and Alerting
- **Description:** Add logging/alerting for failed escrow transactions.
- **Files:** `packages/api/src/services/escrow.ts`, `packages/api/src/services/alerts.ts`
- **Validation:**
  - Failed transaction triggers alert
  - Alert includes: tx hash, error message, user ID, task ID
  - Logged with full details for debugging

#### 7.9 Rate Limiting Hardening
- **Description:** Review and tighten rate limits for production traffic patterns.
- **Files:** `packages/api/src/middleware/rateLimit.ts`
- **Validation:**
  - Load test confirms rate limits work
  - No bypass vulnerabilities
  - Different limits for authenticated vs anonymous

#### 7.10 Security Scan
- **Description:** Run automated security scans (OWASP ZAP, npm audit, Snyk).
- **Files:** `scripts/security-scan.sh`
- **Validation:**
  - No critical or high vulnerabilities
  - All medium issues documented with mitigation timeline
  - npm audit shows 0 high/critical

#### 7.11 Error Handling Audit
- **Description:** Ensure all errors return appropriate status codes without leaking internals.
- **Files:** `packages/api/src/middleware/errorHandler.ts`
- **Validation:**
  - No stack traces in production responses
  - No internal paths exposed
  - Generic messages for 500 errors

#### 7.12 Production Environment Variables Documentation
- **Description:** Document all required env vars for production deployment.
- **Files:** `PRODUCTION.md`, `.env.production.example`
- **Validation:**
  - All required vars listed with descriptions
  - Example values (non-sensitive) provided
  - Fresh deploy following docs succeeds

#### 7.13 Smoke Test Suite
- **Description:** Create smoke test script for production deployment verification.
- **Files:** `scripts/smoke-test.ts`
- **Validation:**
  - Tests: register, create task, claim, upload, submit, accept, dispute, resolve
  - Works against staging and production with env flag
  - Execution time under 5 minutes
  - Exit code 0 on success, non-zero with failure details

#### 7.14 Load Test Suite
- **Description:** Create load test suite for production capacity planning.
- **Files:** `scripts/load-test.ts`
- **Validation:**
  - System handles 100 concurrent users
  - p99 latency under 1s for API endpoints
  - No errors under sustained load

#### 7.15 Mainnet Deployment Runbook
- **Description:** Step-by-step runbook for mainnet deployment with rollback procedures.
- **Files:** `DEPLOYMENT-RUNBOOK.md`
- **Validation:**
  - Step-by-step instructions
  - Rollback procedure for each step
  - Health check verification at each stage

#### 7.16 Launch Checklist
- **Description:** Final checklist covering all launch requirements.
- **Files:** `LAUNCH-CHECKLIST.md`
- **Validation:**
  - All items checked
  - Sign-off from relevant stakeholders
  - Go/no-go criteria defined

---

## Sub-Agent Review Prompt

```
You are a senior software architect reviewing a sprint plan for a Web3 marketplace application called Field Network.

Context:
- Field Network is a decentralized marketplace for verifiable real-world observations
- Users post tasks with bounties, collectors capture geo-verified photos/data
- Uses USDC escrow on Base blockchain, SIWE authentication, Prisma/PostgreSQL

Review the sprint plan above and provide specific, actionable improvements for:

1. **Task Atomicity**: Are any tasks too large and should be split? Are any too small and should be combined?

2. **Dependencies**: Are there missing dependencies between tasks? Are any tasks in the wrong sprint order?

3. **Validation Criteria**: Are the validation criteria specific and testable? Can you suggest more concrete acceptance criteria?

4. **Missing Tasks**: Based on the project context, are there critical tasks missing from any sprint?

5. **Risk Mitigation**: Which tasks have high technical risk? What spikes or prototypes should be added?

6. **Testing Coverage**: Is there sufficient test coverage? Are there missing test types (unit, integration, e2e)?

7. **Sprint Coherence**: Does each sprint result in a demoable increment? Are sprint goals clear?

Format your response as:
- List each issue with the sprint/task number
- Provide a specific recommendation
- Prioritize issues by impact (High/Medium/Low)
```

---

## Improvements Applied

Based on sub-agent review, the following changes were made:

### HIGH PRIORITY - Fixed

1. **Removed duplicate tasks** - Tasks 4.1 (Reputation Schema), 4.2 (Reputation Service), 5.2 (Fee Service), 6.8-6.10 (Achievement System) were already implemented. Repurposed to extend existing functionality.

2. **Added job infrastructure** - Sprint 1 now includes Bull + Redis setup (Task 1.8) and claim expiry job (Task 1.9).

3. **Added notification system** - Sprint 4 includes full notification infrastructure (Tasks 4.5-4.10).

4. **Added testnet soak period** - Sprint 7 Task 7.2 requires 7-day testnet deployment before mainnet.

5. **Added database backup** - Sprint 1 Task 1.10 covers automated backups.

6. **Added security scan** - Sprint 7 Task 7.10 covers OWASP ZAP, npm audit, Snyk.

### MEDIUM PRIORITY - Fixed

7. **Split escrow split task** - Task 3.5 split into 3.4 (Schema), 3.5 (Logic), 3.6 (Tests).

8. **Added map library spike** - Sprint 6 Task 6.1 evaluates mapping libraries before implementation.

9. **Added mobile responsiveness** - Sprint 6 Task 6.10 addresses mobile dashboard UX.

10. **Added E2E test for financial flow** - Sprint 2 Task 2.9 tests complete task lifecycle.

11. **Improved validation criteria** - All tasks now have specific, measurable acceptance criteria.

### LOW PRIORITY - Fixed

12. **Combined S3 tasks** - Tasks 2.3 + 2.4 combined into single task with signed URLs.

13. **Added load testing** - Sprint 7 Task 7.14 creates load test suite.

14. **Added contract documentation** - Sprint 7 Task 7.1 documents upgrade strategy.
