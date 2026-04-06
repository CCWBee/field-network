# Field Network Reputation System

This document describes the reputation system design, scoring algorithm, anti-gaming measures, and badge mechanics for Field Network.

## Overview

The Field Network reputation system provides trust signals for both task requesters and collectors (workers). It enables:

1. **Trust Building**: Users build reputation through consistent, quality work
2. **Fee Optimization**: Higher reputation unlocks lower platform fees
3. **Priority Access**: Trusted users get priority for high-value tasks
4. **Risk Assessment**: Requesters can filter collectors by reputation

## Reliability Score

### Calculation Formula

```
Reliability Score = (Acceptance Rate * 70%) + (Dispute-Free Rate * 30%) + Streak Bonus
```

Where:
- **Acceptance Rate** = (Tasks Accepted / Tasks Delivered) * 100
- **Dispute-Free Rate** = (1 - Dispute Rate) * 100
- **Streak Bonus** = min(Current Streak, 5)

The score is clamped between 0 and 100.

### Score Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Acceptance Rate | 70% | Percentage of submitted work that gets accepted |
| Dispute-Free Rate | 30% | Percentage of work completed without disputes |
| Streak Bonus | +5 max | Consecutive accepted submissions |

### Score Tiers

| Tier | Score Range | Benefits |
|------|-------------|----------|
| Prime Operator | 95-100 | Lowest fees, priority claims, premium badge |
| Vector Elite | 85-94 | Reduced fees, badge |
| Field Specialist | 70-84 | Standard fees |
| Rookie | 0-69 | Higher fees, may be excluded from premium tasks |

## Anti-Gaming Measures

### 1. Sybil Resistance

**Problem**: Users creating multiple accounts to inflate their reputation or self-deal.

**Mitigations**:
- **Wallet verification required**: Primary wallet must be verified via SIWE
- **One primary wallet per user**: Prevents easy account switching
- **IP fingerprinting** (logged): Unusual patterns from same IP flagged
- **Email verification**: Optional but encouraged for account recovery
- **Minimum account age**: Some features require accounts older than X days

### 2. Self-Dealing Prevention

**Problem**: Requester creates tasks and completes them with their own worker account.

**Mitigations**:
- **Same-wallet detection**: System flags when requester and worker share any linked wallet
- **IP pattern analysis**: Same IP completing own tasks triggers review
- **Bounty threshold**: Self-dealt tasks below $100 don't count toward reputation
- **Rate limiting**: Max 3 active claims per user prevents bulk self-dealing
- **Manual review trigger**: Unusual completion patterns flagged for admin review

### 3. Collusion Detection

**Problem**: Two users repeatedly transact to boost each other's scores.

**Mitigations**:
- **Repeat interaction limit**: Same requester-worker pair limited to 5 transactions per 30 days before reduced score impact
- **Network analysis**: Graph analysis identifies tightly-coupled clusters
- **Bounty diversity requirement**: Reputation gains diminished if >50% of work comes from single requester
- **Time-based decay**: Very rapid task completion chains flagged

### 4. Gaming via Task Abandonment

**Problem**: Users claim tasks to prevent others from completing them.

**Mitigations**:
- **Claim TTL**: Claims expire after 4 hours
- **Strike system**: Abandoned claims add strikes to worker profile
- **Claim limit**: Maximum 3 concurrent claims per user
- **Reputation penalty**: -5 reliability points per abandoned claim
- **Streak reset**: Any abandonment resets current acceptance streak

### 5. Dispute Abuse

**Problem**: Workers dispute every rejection to avoid reputation hits.

**Mitigations**:
- **Arbitration fee**: Losing party pays 5% arbitration fee
- **Dispute rate tracking**: High dispute rates visible to requesters
- **Pattern detection**: Users with >20% dispute rate flagged
- **Strike escalation**: Frivolous disputes result in strikes

## Reputation Events

All score changes are logged in the `ReputationEvent` table for transparency and audit.

### Event Types

| Event | Impact | Description |
|-------|--------|-------------|
| `task_accepted` | Positive | Submission accepted by requester |
| `task_rejected` | Negative | Submission rejected by requester |
| `dispute_resolved` | Variable | Based on outcome |
| `claim_abandoned` | Negative | Claim expired or released without submission |
| `badge_earned` | Neutral | Achievement unlocked |
| `streak_bonus` | Positive | Streak milestone reached |
| `initial_setup` | Neutral | Account created |
| `recalculation` | Variable | Periodic score recalculation |

### History API

Users can view their reputation history:

```
GET /v1/profile/me/reputation-history
```

Returns:
```json
{
  "events": [
    {
      "id": "event-uuid",
      "previous_score": 85,
      "new_score": 87,
      "score_change": 2,
      "reason": "task_accepted",
      "task_id": "task-uuid",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 50
}
```

## Badge System

### Milestone Badges

Awarded based on cumulative achievements:

| Badge | Requirement | Category |
|-------|-------------|----------|
| First Light | 1 accepted bounty | milestone |
| Signal Boost | 10 accepted bounties | milestone |
| Wayfinder | 25 accepted bounties | milestone |
| Ground Crew | 50 accepted bounties | milestone |
| GeoGuessr | 100 accepted bounties | milestone |
| Cartographer | 250 accepted bounties | milestone |
| Atlas Operator | 500 accepted bounties | milestone |
| Orbital | 1,000 accepted bounties | milestone |

### Bounty Badges

Awarded for completing high-value tasks:

| Badge | Requirement | Category |
|-------|-------------|----------|
| Comet | Complete bounty >= $250 | bounty |
| High Roller | Complete bounty >= $1,000 | bounty |
| Whale Signal | Complete bounty >= $5,000 | bounty |

### Distance Badges

Awarded for geographic diversity:

| Badge | Requirement | Category |
|-------|-------------|----------|
| Long Haul | 1,000+ km between two accepted tasks | distance |
| Blue Marble | 5,000+ km between two accepted tasks | distance |

### Streak Badges

Awarded for consistency:

| Badge | Requirement | Category |
|-------|-------------|----------|
| Glidepath | 5-task acceptance streak | streak |
| Iron Streak | 10-task acceptance streak | streak |
| Marathon | 50-task acceptance streak | streak |

### Quality Badges

Awarded for maintaining high standards:

| Badge | Requirement | Category |
|-------|-------------|----------|
| Clean Signal | <1% dispute rate after 20 tasks | quality |
| Silent Running | 0% disputes after 10 tasks | quality |

### Earnings Badges

| Badge | Requirement | Category |
|-------|-------------|----------|
| Treasure Map | $10,000 lifetime earnings | earnings |

## Fee Tiers

Reputation directly impacts platform fees:

| Tier | Requirements | Platform Fee |
|------|--------------|--------------|
| Standard | New users | 10% |
| Trusted | 30+ days, 10+ accepted, 80+ reliability | 7% |
| Verified | 90+ days, 50+ accepted, 90+ reliability | 5% |

Users are automatically notified when they qualify for a new tier.

## Data Retention

- **Reputation events**: Retained indefinitely for audit
- **Score history**: Aggregated after 1 year (daily averages kept)
- **Badge history**: Permanent
- **Dispute records**: Retained for 7 years (regulatory compliance)

## API Endpoints

### Get User Stats
```
GET /v1/users/me/stats
```

### Get Reputation History
```
GET /v1/profile/me/reputation-history?limit=50&offset=0
```

### Get Public Profile (includes reputation)
```
GET /v1/profile/:username
```

### Get Badges
```
GET /v1/badges/me
```

## Future Considerations

1. **Machine Learning Detection**: Train models on known gaming patterns
2. **Stake-Based Reputation**: Require USDC stake that's slashed for bad behavior
3. **Cross-Platform Reputation**: Import reputation from other Web3 platforms
4. **Reputation Decay**: Inactive accounts slowly lose reputation over time
5. **Verification Levels**: KYC-verified users get reputation boost
6. **Geographic Reputation**: Separate reputation scores by region

## Changelog

- **v1.0** (Jan 2026): Initial reputation system with badges and history tracking
