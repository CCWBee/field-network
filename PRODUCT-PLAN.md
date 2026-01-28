# Field Network - Product Gaps and Feature Plan

This document captures the current product gaps and a concrete feature plan to address them. It assumes Web3 is used for login and payments, and the core experience is a reputation-based marketplace similar to eBay/Amazon/Vinted.

## Principles

- Trust is earned through observable history, not claims.
- Decisions should feel professional, predictable, and auditable.
- The platform should be simple to use but visually premium and confident.

## Gaps and Proposed Solutions

### 1) Trust, Safety, and Reputation

Problem: Bad actors, low-quality submissions, or repeat disputes can degrade trust.

Solutions:
- Reputation profile for all users (requesters and collectors).
- Scoring based on fulfillment rate, dispute outcomes, and verified work quality.
- Progressive privileges tied to account age and performance.
- Automated and human dispute signals: flags, time-to-resolve, and abuse tracking.
- Rate limits and task posting limits for low-trust accounts.

### 2) Economic Model and Incentives

Problem: Fee structure, resell rights, royalties, and dispute costs need clarity.

Solutions:
- Start platform fee at 10%, reduce to 5% for trusted users with high completion and low dispute rates.
- Resale rights: platform retains perpetual resell rights after 90 days; collector receives a royalty.
- Dispute arbitration: loser pays arbitration fee; small claims can use a fixed fee, higher claims use a percentage.
- Slashing: both sides place a small stake that can be slashed for bad behavior.

### 3) Verification and Anti-Fraud

Problem: GPS spoofing, staged photos, replayed artefacts, and timestamp fraud.

Solutions:
- Device and metadata verification rules (EXIF, checksum, camera model heuristics).
- Location integrity checks: GPS accuracy bounds, speed constraints, and route plausibility.
- Replay detection: cross-submission hashing and duplicate matching.
- Verification tiers: auto-accept for low-risk tasks, manual review for suspicious patterns.

### 4) Disputes and Arbitration

Problem: Disputes can be slow and opaque without tooling.

Solutions:
- Built-in dispute flow with evidence submission, deadlines, and decision history.
- Arbitrator pool (internal for now, external partners later).
- Clear arbitration SLA and transparent resolution criteria.
- On-chain record of dispute outcomes tied to reputation impact.

### 5) Ops and Admin Tooling

Problem: No admin tooling makes it hard to intervene or support users.

Solutions:
- Admin dashboard: task monitoring, disputes, escrow status, and payout controls.
- Abuse monitoring: automated flags, blacklist tools, and audit logs.
- Support tooling: user lookup, account health metrics, and action history.

### 6) UX and Product Identity

Problem: UX can feel plain and occasional theme inconsistencies exist.

Solutions:
- Collector experience: progress-based submission flow, clear status and payout tracking.
- Collector dashboard: map of completed bounties, lifetime earnings, royalties, and profile achievements.
- Requester dashboard: live bounties, total fulfilled, and nearby data inventory.
- Visual identity:  Field Network theme using modern, precise visuals (clean glass, map motifs, data overlays).
- UI cleanup: fix color mismatches and improve typography hierarchy.

## Feature List (Prioritized)

P0 - Launch blockers
- Production storage provider (S3/R2/Azure) with signed URLs.
- PostgreSQL migration plan and production DB setup.
- On-chain escrow wiring with live contract address.
- Dispute flow UX and rules enforced.
- Admin dashboard (minimal) for disputes and task moderation.

P1 - Trust and economics
- Reputation and trust scoring system.
- Progressive fee reduction (10% down to 5%).
- Arbitration fee logic and loser-pays enforcement.
- Slashing for bad behavior (claim abandonment, fraud, or malicious disputes).

P2 - UX and growth
- Collector dashboard: stats, earnings, royalties, achievement card, map of completed tasks.
- Requester dashboard: live bounties, total fulfilled, nearby data suggestions.
- Data resale marketplace or inventory feed.
- Brand-driven UI refresh with consistent Field Network theme.

## Suggested Next Steps

1) Decide storage provider and arbitration fee model.
2) Define reputation score formula and thresholds.
3) Implement a basic admin console and dispute workflow.
4) Update the UI roadmap for the dashboards.

