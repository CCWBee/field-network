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

async function ensureBadgeDefinitions() {
  const definitions = [
    {
      type: 'first_light',
      name: 'First Light',
      description: 'Complete your first accepted bounty.',
      category: 'milestone',
    },
    {
      type: 'signal_boost',
      name: 'Signal Boost',
      description: '10 accepted bounties.',
      category: 'milestone',
    },
    {
      type: 'wayfinder',
      name: 'Wayfinder',
      description: '25 accepted bounties.',
      category: 'milestone',
    },
    {
      type: 'ground_crew',
      name: 'Ground Crew',
      description: '50 accepted bounties.',
      category: 'milestone',
    },
    {
      type: 'geoguesser',
      name: 'GeoGuessr',
      description: '100 accepted bounties.',
      category: 'milestone',
    },
    {
      type: 'cartographer',
      name: 'Cartographer',
      description: '250 accepted bounties.',
      category: 'milestone',
    },
    {
      type: 'atlas_operator',
      name: 'Atlas Operator',
      description: '500 accepted bounties.',
      category: 'milestone',
    },
    {
      type: 'orbital',
      name: 'Orbital',
      description: '1,000 accepted bounties.',
      category: 'milestone',
    },
    {
      type: 'comet',
      name: 'Comet',
      description: 'Complete a bounty worth 250 or more.',
      category: 'bounty',
    },
    {
      type: 'high_roller',
      name: 'High Roller',
      description: 'Complete a bounty worth 1,000 or more.',
      category: 'bounty',
    },
    {
      type: 'whale_signal',
      name: 'Whale Signal',
      description: 'Complete a bounty worth 5,000 or more.',
      category: 'bounty',
    },
    {
      type: 'long_haul',
      name: 'Long Haul',
      description: 'Distance between two accepted bounties exceeds 1,000 km.',
      category: 'distance',
    },
    {
      type: 'blue_marble',
      name: 'Blue Marble',
      description: 'Distance between two accepted bounties exceeds 5,000 km.',
      category: 'distance',
    },
    {
      type: 'glidepath',
      name: 'Glidepath',
      description: 'Maintain a 5-task acceptance streak.',
      category: 'streak',
    },
    {
      type: 'iron_streak',
      name: 'Iron Streak',
      description: 'Maintain a 10-task acceptance streak.',
      category: 'streak',
    },
    {
      type: 'marathon',
      name: 'Marathon',
      description: 'Maintain a 50-task acceptance streak.',
      category: 'streak',
    },
    {
      type: 'clean_signal',
      name: 'Clean Signal',
      description: 'Keep dispute rate under 1% after 20 accepted tasks.',
      category: 'quality',
    },
    {
      type: 'silent_running',
      name: 'Silent Running',
      description: 'Zero disputes after 10 accepted tasks.',
      category: 'quality',
    },
    {
      type: 'treasure_map',
      name: 'Treasure Map',
      description: 'Earn 10,000 in lifetime bounties.',
      category: 'earnings',
    },
  ];

  await Promise.all(definitions.map((definition) => (
    prisma.badgeDefinition.upsert({
      where: { type: definition.type },
      update: {
        name: definition.name,
        description: definition.description,
        category: definition.category,
      },
      create: {
        type: definition.type,
        name: definition.name,
        description: definition.description,
        category: definition.category,
      },
    })
  )));
}

async function awardBadge(
  userId: string,
  badgeType: string,
  title: string,
  description: string,
  currentScore: number
): Promise<boolean> {
  const existing = await prisma.userBadge.findUnique({
    where: {
      userId_badgeType_tier: {
        userId,
        badgeType,
        tier: 'gold',
      },
    },
  });

  if (existing) return false;

  await prisma.userBadge.create({
    data: {
      userId,
      badgeType,
      tier: 'gold',
      title,
      description,
    },
  });

  // Log badge earned event
  await logReputationEvent({
    userId,
    previousScore: currentScore,
    newScore: currentScore,
    reason: 'badge_earned',
    badgeType,
    metadata: { title, description },
  });

  return true; // Badge was awarded
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

  const awardedBadges: string[] = [];
  const awards: Array<{ type: string; title: string; description: string; condition: boolean }> = [
    {
      type: 'first_light',
      title: 'First Light',
      description: 'Complete your first accepted bounty.',
      condition: data.acceptedCount >= 1,
    },
    {
      type: 'signal_boost',
      title: 'Signal Boost',
      description: '10 accepted bounties.',
      condition: data.acceptedCount >= 10,
    },
    {
      type: 'wayfinder',
      title: 'Wayfinder',
      description: '25 accepted bounties.',
      condition: data.acceptedCount >= 25,
    },
    {
      type: 'ground_crew',
      title: 'Ground Crew',
      description: '50 accepted bounties.',
      condition: data.acceptedCount >= 50,
    },
    {
      type: 'geoguesser',
      title: 'GeoGuessr',
      description: '100 accepted bounties.',
      condition: data.acceptedCount >= 100,
    },
    {
      type: 'cartographer',
      title: 'Cartographer',
      description: '250 accepted bounties.',
      condition: data.acceptedCount >= 250,
    },
    {
      type: 'atlas_operator',
      title: 'Atlas Operator',
      description: '500 accepted bounties.',
      condition: data.acceptedCount >= 500,
    },
    {
      type: 'orbital',
      title: 'Orbital',
      description: '1,000 accepted bounties.',
      condition: data.acceptedCount >= 1000,
    },
    {
      type: 'comet',
      title: 'Comet',
      description: 'Complete a bounty worth 250 or more.',
      condition: data.maxBounty >= 250,
    },
    {
      type: 'high_roller',
      title: 'High Roller',
      description: 'Complete a bounty worth 1,000 or more.',
      condition: data.maxBounty >= 1000,
    },
    {
      type: 'whale_signal',
      title: 'Whale Signal',
      description: 'Complete a bounty worth 5,000 or more.',
      condition: data.maxBounty >= 5000,
    },
    {
      type: 'long_haul',
      title: 'Long Haul',
      description: 'Distance between two accepted bounties exceeds 1,000 km.',
      condition: data.maxDistanceKm >= 1000,
    },
    {
      type: 'blue_marble',
      title: 'Blue Marble',
      description: 'Distance between two accepted bounties exceeds 5,000 km.',
      condition: data.maxDistanceKm >= 5000,
    },
    {
      type: 'glidepath',
      title: 'Glidepath',
      description: 'Maintain a 5-task acceptance streak.',
      condition: data.currentStreak >= 5,
    },
    {
      type: 'iron_streak',
      title: 'Iron Streak',
      description: 'Maintain a 10-task acceptance streak.',
      condition: data.currentStreak >= 10,
    },
    {
      type: 'marathon',
      title: 'Marathon',
      description: 'Maintain a 50-task acceptance streak.',
      condition: data.currentStreak >= 50,
    },
    {
      type: 'clean_signal',
      title: 'Clean Signal',
      description: 'Keep dispute rate under 1% after 20 accepted tasks.',
      condition: data.acceptedCount >= 20 && data.disputeRate < 1,
    },
    {
      type: 'silent_running',
      title: 'Silent Running',
      description: 'Zero disputes after 10 accepted tasks.',
      condition: data.acceptedCount >= 10 && data.disputeRate === 0,
    },
    {
      type: 'treasure_map',
      title: 'Treasure Map',
      description: 'Earn 10,000 in lifetime bounties.',
      condition: data.totalEarned >= 10000,
    },
  ];

  for (const award of awards) {
    if (award.condition) {
      const wasAwarded = await awardBadge(userId, award.type, award.title, award.description, data.reliabilityScore);
      if (wasAwarded) {
        awardedBadges.push(award.type);
      }
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
