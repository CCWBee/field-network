import { prisma } from './database';

const DEFAULT_RELIABILITY = 100;
const MAX_DISTANCE_SAMPLE = 200;

// Reputation event reasons
export type ReputationReason =
  | 'task_accepted'
  | 'task_rejected'
  | 'dispute_resolved'
  | 'claim_abandoned'
  | 'badge_earned'
  | 'streak_bonus'
  | 'initial_setup'
  | 'recalculation';

interface ReputationEventData {
  userId: string;
  previousScore: number;
  newScore: number;
  reason: ReputationReason;
  taskId?: string;
  submissionId?: string;
  badgeType?: string;
  metadata?: Record<string, any>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Log a reputation event for history tracking
 */
export async function logReputationEvent(data: ReputationEventData): Promise<void> {
  // Only log if there's an actual score change or a significant event
  if (data.previousScore === data.newScore && data.reason === 'recalculation') {
    return; // Skip logging no-op recalculations
  }

  await prisma.reputationEvent.create({
    data: {
      userId: data.userId,
      previousScore: data.previousScore,
      newScore: data.newScore,
      reason: data.reason,
      taskId: data.taskId,
      submissionId: data.submissionId,
      badgeType: data.badgeType,
      metadata: JSON.stringify(data.metadata || {}),
    },
  });
}

/**
 * Get reputation history for a user
 */
export async function getReputationHistory(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{
  events: Array<{
    id: string;
    previousScore: number;
    newScore: number;
    reason: string;
    taskId: string | null;
    badgeType: string | null;
    metadata: Record<string, any>;
    createdAt: Date;
  }>;
  total: number;
}> {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const [events, total] = await Promise.all([
    prisma.reputationEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.reputationEvent.count({ where: { userId } }),
  ]);

  return {
    events: events.map((e) => ({
      id: e.id,
      previousScore: e.previousScore,
      newScore: e.newScore,
      reason: e.reason,
      taskId: e.taskId,
      badgeType: e.badgeType,
      metadata: JSON.parse(typeof e.metadata === 'string' ? e.metadata : JSON.stringify(e.metadata)),
      createdAt: e.createdAt,
    })),
    total,
  };
}

async function ensureUserStats(userId: string) {
  const existing = await prisma.userStats.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  return prisma.userStats.create({
    data: {
      userId,
      reliabilityScore: DEFAULT_RELIABILITY,
      disputeRate: 0,
      currentStreak: 0,
      longestStreak: 0,
    },
  });
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateMaxDistanceKm(tasks: Array<{ lat: number; lon: number }>) {
  if (tasks.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const distance = calculateDistanceKm(tasks[i].lat, tasks[i].lon, tasks[j].lat, tasks[j].lon);
      if (distance > max) {
        max = distance;
      }
    }
  }
  return max;
}

export type TierThreshold = { tier: string; threshold: number };

// Tier threshold tables (exported for reuse in seed/tests)
export const BADGE_TIERS: Record<string, TierThreshold[]> = {
  // Acceptance count milestones
  first_light: [
    { tier: 'bronze', threshold: 1 },
    { tier: 'silver', threshold: 5 },
    { tier: 'gold', threshold: 25 },
    { tier: 'platinum', threshold: 100 },
  ],
  signal_boost: [
    { tier: 'bronze', threshold: 10 },
    { tier: 'silver', threshold: 25 },
    { tier: 'gold', threshold: 100 },
    { tier: 'platinum', threshold: 500 },
  ],
  wayfinder: [
    { tier: 'bronze', threshold: 25 },
    { tier: 'silver', threshold: 75 },
    { tier: 'gold', threshold: 250 },
    { tier: 'platinum', threshold: 1000 },
  ],
  ground_crew: [
    { tier: 'bronze', threshold: 50 },
    { tier: 'silver', threshold: 150 },
    { tier: 'gold', threshold: 500 },
    { tier: 'platinum', threshold: 2000 },
  ],
  geoguesser: [
    { tier: 'bronze', threshold: 100 },
    { tier: 'silver', threshold: 300 },
    { tier: 'gold', threshold: 1000 },
    { tier: 'platinum', threshold: 5000 },
  ],
  cartographer: [
    { tier: 'bronze', threshold: 250 },
    { tier: 'silver', threshold: 750 },
    { tier: 'gold', threshold: 2500 },
    { tier: 'platinum', threshold: 10000 },
  ],
  atlas_operator: [
    { tier: 'bronze', threshold: 500 },
    { tier: 'silver', threshold: 1500 },
    { tier: 'gold', threshold: 5000 },
    { tier: 'platinum', threshold: 20000 },
  ],
  orbital: [
    { tier: 'bronze', threshold: 1000 },
    { tier: 'silver', threshold: 3000 },
    { tier: 'gold', threshold: 10000 },
    { tier: 'platinum', threshold: 50000 },
  ],
  // Single-bounty value
  comet: [
    { tier: 'bronze', threshold: 250 },
    { tier: 'silver', threshold: 500 },
    { tier: 'gold', threshold: 1000 },
    { tier: 'platinum', threshold: 2500 },
  ],
  high_roller: [
    { tier: 'bronze', threshold: 1000 },
    { tier: 'silver', threshold: 2500 },
    { tier: 'gold', threshold: 5000 },
    { tier: 'platinum', threshold: 10000 },
  ],
  whale_signal: [
    { tier: 'bronze', threshold: 5000 },
    { tier: 'silver', threshold: 10000 },
    { tier: 'gold', threshold: 25000 },
    { tier: 'platinum', threshold: 100000 },
  ],
  // Distance (km)
  long_haul: [
    { tier: 'bronze', threshold: 10 },
    { tier: 'silver', threshold: 50 },
    { tier: 'gold', threshold: 200 },
    { tier: 'platinum', threshold: 1000 },
  ],
  blue_marble: [
    { tier: 'bronze', threshold: 1000 },
    { tier: 'silver', threshold: 2500 },
    { tier: 'gold', threshold: 5000 },
    { tier: 'platinum', threshold: 15000 },
  ],
  // Streaks
  glidepath: [
    { tier: 'bronze', threshold: 3 },
    { tier: 'silver', threshold: 10 },
    { tier: 'gold', threshold: 30 },
    { tier: 'platinum', threshold: 100 },
  ],
  iron_streak: [
    { tier: 'bronze', threshold: 10 },
    { tier: 'silver', threshold: 25 },
    { tier: 'gold', threshold: 50 },
    { tier: 'platinum', threshold: 200 },
  ],
  marathon: [
    { tier: 'bronze', threshold: 50 },
    { tier: 'silver', threshold: 100 },
    { tier: 'gold', threshold: 250 },
    { tier: 'platinum', threshold: 1000 },
  ],
  // Quality (binary -> single gold tier)
  clean_signal: [{ tier: 'gold', threshold: 1 }],
  silent_running: [{ tier: 'gold', threshold: 1 }],
  // Lifetime earnings
  treasure_map: [
    { tier: 'bronze', threshold: 1000 },
    { tier: 'silver', threshold: 5000 },
    { tier: 'gold', threshold: 10000 },
    { tier: 'platinum', threshold: 50000 },
  ],
};

const BADGE_METADATA: Array<{
  type: string;
  name: string;
  description: string;
  category: string;
}> = [
  { type: 'first_light', name: 'First Light', description: 'Complete accepted bounties.', category: 'milestone' },
  { type: 'signal_boost', name: 'Signal Boost', description: 'Rack up accepted bounties.', category: 'milestone' },
  { type: 'wayfinder', name: 'Wayfinder', description: 'Reach wayfinder territory with accepted bounties.', category: 'milestone' },
  { type: 'ground_crew', name: 'Ground Crew', description: 'Become part of the ground crew.', category: 'milestone' },
  { type: 'geoguesser', name: 'GeoGuessr', description: 'Hit triple-digit accepted bounties.', category: 'milestone' },
  { type: 'cartographer', name: 'Cartographer', description: 'Map the world with accepted bounties.', category: 'milestone' },
  { type: 'atlas_operator', name: 'Atlas Operator', description: 'Operate at atlas scale.', category: 'milestone' },
  { type: 'orbital', name: 'Orbital', description: 'Achieve orbital throughput on accepted bounties.', category: 'milestone' },
  { type: 'comet', name: 'Comet', description: 'Complete high-value bounties.', category: 'bounty' },
  { type: 'high_roller', name: 'High Roller', description: 'Complete premium bounties.', category: 'bounty' },
  { type: 'whale_signal', name: 'Whale Signal', description: 'Complete whale-tier bounties.', category: 'bounty' },
  { type: 'long_haul', name: 'Long Haul', description: 'Cover long distances between accepted bounties.', category: 'distance' },
  { type: 'blue_marble', name: 'Blue Marble', description: 'Span the planet with accepted bounties.', category: 'distance' },
  { type: 'glidepath', name: 'Glidepath', description: 'Maintain an acceptance streak.', category: 'streak' },
  { type: 'iron_streak', name: 'Iron Streak', description: 'Forge an iron acceptance streak.', category: 'streak' },
  { type: 'marathon', name: 'Marathon', description: 'Run a marathon-length acceptance streak.', category: 'streak' },
  { type: 'clean_signal', name: 'Clean Signal', description: 'Keep dispute rate under 1% after 20 accepted tasks.', category: 'quality' },
  { type: 'silent_running', name: 'Silent Running', description: 'Zero disputes after 10 accepted tasks.', category: 'quality' },
  { type: 'treasure_map', name: 'Treasure Map', description: 'Earn lifetime bounty milestones.', category: 'earnings' },
];

export async function ensureBadgeDefinitions() {
  await Promise.all(BADGE_METADATA.map((definition) => (
    prisma.badgeDefinition.upsert({
      where: { type: definition.type },
      update: {
        name: definition.name,
        description: definition.description,
        category: definition.category,
        tiers: BADGE_TIERS[definition.type] ?? [],
      },
      create: {
        type: definition.type,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        tiers: BADGE_TIERS[definition.type] ?? [],
      },
    })
  )));
}

export function calculateTier(value: number, thresholds: TierThreshold[]): string | null {
  const sorted = [...thresholds].sort((a, b) => b.threshold - a.threshold);
  for (const t of sorted) {
    if (value >= t.threshold) return t.tier;
  }
  return null;
}

async function awardBadge(
  userId: string,
  badgeType: string,
  tier: string,
  title: string,
  description: string,
  currentScore: number
): Promise<boolean> {
  const existing = await prisma.userBadge.findUnique({
    where: {
      userId_badgeType_tier: {
        userId,
        badgeType,
        tier,
      },
    },
  });

  if (existing) return false;

  await prisma.userBadge.create({
    data: {
      userId,
      badgeType,
      tier,
      title,
      description,
    },
  });

  await logReputationEvent({
    userId,
    previousScore: currentScore,
    newScore: currentScore,
    reason: 'badge_earned',
    badgeType,
    metadata: { title, description, tier },
  });

  return true;
}

async function syncBadges(userId: string, data: {
  acceptedCount: number;
  totalEarned: number;
  maxBounty: number;
  maxDistanceKm: number;
  currentStreak: number;
  reliabilityScore: number;
  disputeRate: number;
}): Promise<string[]> {
  await ensureBadgeDefinitions();

  const metricForBadge = (type: string): number => {
    switch (type) {
      case 'first_light':
      case 'signal_boost':
      case 'wayfinder':
      case 'ground_crew':
      case 'geoguesser':
      case 'cartographer':
      case 'atlas_operator':
      case 'orbital':
        return data.acceptedCount;
      case 'comet':
      case 'high_roller':
      case 'whale_signal':
        return data.maxBounty;
      case 'long_haul':
      case 'blue_marble':
        return data.maxDistanceKm;
      case 'glidepath':
      case 'iron_streak':
      case 'marathon':
        return data.currentStreak;
      case 'treasure_map':
        return data.totalEarned;
      case 'clean_signal':
        return data.acceptedCount >= 20 && data.disputeRate < 1 ? 1 : 0;
      case 'silent_running':
        return data.acceptedCount >= 10 && data.disputeRate === 0 ? 1 : 0;
      default:
        return 0;
    }
  };

  const awardedBadges: string[] = [];

  for (const meta of BADGE_METADATA) {
    const thresholds = BADGE_TIERS[meta.type] ?? [];
    const value = metricForBadge(meta.type);
    const tier = calculateTier(value, thresholds);
    if (!tier) continue;

    const wasAwarded = await awardBadge(
      userId,
      meta.type,
      tier,
      meta.name,
      meta.description,
      data.reliabilityScore
    );
    if (wasAwarded) {
      awardedBadges.push(`${meta.type}:${tier}`);
    }
  }

  return awardedBadges;
}

async function calculateWorkerStreaks(userId: string) {
  const submissions = await prisma.submission.findMany({
    where: {
      workerId: userId,
      finalisedAt: { not: null },
    },
    select: {
      status: true,
      finalisedAt: true,
    },
    orderBy: { finalisedAt: 'asc' },
  });

  if (submissions.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  let longestStreak = 0;
  let runningStreak = 0;

  for (const submission of submissions) {
    if (submission.status === 'accepted') {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  let currentStreak = 0;
  for (let i = submissions.length - 1; i >= 0; i -= 1) {
    if (submissions[i].status === 'accepted') {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return { currentStreak, longestStreak };
}

export interface RecalculateOptions {
  reason?: ReputationReason;
  taskId?: string;
  submissionId?: string;
}

export async function recalculateUserStats(
  userId: string,
  options: RecalculateOptions = {}
): Promise<{ awardedBadges: string[] }> {
  const existingStats = await ensureUserStats(userId);
  const previousScore = existingStats.reliabilityScore;

  const [
    tasksPosted,
    tasksCompleted,
    bountiesPaidAggregate,
    tasksClaimed,
    tasksDelivered,
    tasksAccepted,
    tasksRejected,
    acceptedSubmissions,
    disputesCount,
    streaks,
  ] = await Promise.all([
    prisma.task.count({
      where: {
        requesterId: userId,
        status: { not: 'draft' },
      },
    }),
    prisma.task.count({
      where: {
        requesterId: userId,
        status: 'accepted',
      },
    }),
    prisma.task.aggregate({
      where: {
        requesterId: userId,
        status: 'accepted',
      },
      _sum: { bountyAmount: true },
    }),
    prisma.taskClaim.count({
      where: { workerId: userId },
    }),
    prisma.submission.count({
      where: {
        workerId: userId,
        finalisedAt: { not: null },
      },
    }),
    prisma.submission.count({
      where: {
        workerId: userId,
        status: 'accepted',
      },
    }),
    prisma.submission.count({
      where: {
        workerId: userId,
        status: 'rejected',
      },
    }),
    prisma.submission.findMany({
      where: {
        workerId: userId,
        status: 'accepted',
      },
      select: {
        task: {
          select: { id: true, bountyAmount: true, locationLat: true, locationLon: true },
        },
      },
    }),
    prisma.dispute.count({
      where: {
        submission: { workerId: userId },
      },
    }),
    calculateWorkerStreaks(userId),
  ]);

  const totalEarned = acceptedSubmissions.reduce((sum, submission) => {
    return sum + (submission.task?.bountyAmount ?? 0);
  }, 0);
  const maxBounty = acceptedSubmissions.reduce((max, submission) => {
    return Math.max(max, submission.task?.bountyAmount ?? 0);
  }, 0);
  const acceptedTasks = acceptedSubmissions
    .map((submission) => submission.task)
    .filter((task) => task?.locationLat != null && task?.locationLon != null)
    .slice(0, MAX_DISTANCE_SAMPLE)
    .map((task) => ({
      id: task!.id,
      lat: task!.locationLat,
      lon: task!.locationLon,
    }));
  const uniqueTasks = new Map<string, { lat: number; lon: number }>();
  for (const task of acceptedTasks) {
    if (!uniqueTasks.has(task.id)) {
      uniqueTasks.set(task.id, { lat: task.lat, lon: task.lon });
    }
  }
  const maxDistanceKm = calculateMaxDistanceKm(Array.from(uniqueTasks.values()));

  const deliveredCount = tasksDelivered;
  const acceptanceRate = deliveredCount > 0 ? tasksAccepted / deliveredCount : 1;
  const disputeRate = deliveredCount > 0 ? (disputesCount / deliveredCount) * 100 : 0;
  const streakBonus = Math.min(streaks.currentStreak, 5);

  const reliabilityScore = clamp(
    Math.round((acceptanceRate * 100 * 0.7) + ((1 - disputeRate / 100) * 100 * 0.3) + streakBonus),
    0,
    100
  );

  await prisma.userStats.update({
    where: { userId },
    data: {
      tasksPosted,
      tasksCompleted,
      totalBountiesPaid: bountiesPaidAggregate._sum.bountyAmount ?? 0,
      tasksClaimed,
      tasksDelivered,
      tasksAccepted,
      tasksRejected,
      totalEarned,
      disputeRate,
      reliabilityScore,
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      lastCalculatedAt: new Date(),
    },
  });

  // Log reputation event if score changed
  if (previousScore !== reliabilityScore || options.reason) {
    await logReputationEvent({
      userId,
      previousScore,
      newScore: reliabilityScore,
      reason: options.reason || 'recalculation',
      taskId: options.taskId,
      submissionId: options.submissionId,
      metadata: {
        acceptanceRate,
        disputeRate,
        streakBonus,
        tasksAccepted,
        tasksDelivered,
      },
    });
  }

  const awardedBadges = await syncBadges(userId, {
    acceptedCount: tasksAccepted,
    totalEarned,
    maxBounty,
    maxDistanceKm,
    currentStreak: streaks.currentStreak,
    reliabilityScore,
    disputeRate,
  });

  return { awardedBadges };
}
