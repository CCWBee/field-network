import { prisma } from './database';

// Default fee tiers - used when database has no config
// Fee rates align with on-chain contract default of 2.5% (250 bps)
// Higher-tier users get reduced rates; standard rate is 2.5% to match contract
const DEFAULT_PLATFORM_FEE_TIERS = [
  { tierOrder: 0, minDays: 180, minAccepted: 50, minReliability: 90, rate: 0.015, name: 'Elite' },      // 1.5%
  { tierOrder: 1, minDays: 90, minAccepted: 20, minReliability: 80, rate: 0.02, name: 'Trusted' },       // 2.0%
  { tierOrder: 2, minDays: 30, minAccepted: 5, minReliability: 70, rate: 0.0225, name: 'Established' },  // 2.25%
  { tierOrder: 3, minDays: 0, minAccepted: 0, minReliability: 0, rate: 0.025, name: 'Standard' },        // 2.5% (matches on-chain default)
];

const DEFAULT_ARBITRATION_FEE = {
  rate: 0.02,
  min: 2,
  max: 50,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Fee tier info for display
export interface FeeTierInfo {
  name: string;
  rate: number;
  tierOrder: number;
  minAccountDays: number;
  minTasksAccepted: number;
  minReliability: number;
}

// Get all platform fee tiers (from DB or defaults)
export async function getPlatformFeeTiers(): Promise<FeeTierInfo[]> {
  const dbTiers = await prisma.feeConfig.findMany({
    where: { feeType: 'platform', isActive: true },
    orderBy: { tierOrder: 'asc' },
  });

  if (dbTiers.length > 0) {
    return dbTiers.map(t => ({
      name: t.name,
      rate: t.rate,
      tierOrder: t.tierOrder,
      minAccountDays: t.minAccountDays,
      minTasksAccepted: t.minTasksAccepted,
      minReliability: t.minReliability,
    }));
  }

  // Return defaults
  return DEFAULT_PLATFORM_FEE_TIERS.map(t => ({
    name: t.name,
    rate: t.rate,
    tierOrder: t.tierOrder,
    minAccountDays: t.minDays,
    minTasksAccepted: t.minAccepted,
    minReliability: t.minReliability,
  }));
}

// Get user's current fee tier
export async function getUserFeeTier(userId: string): Promise<FeeTierInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { stats: true },
  });

  const tiers = await getPlatformFeeTiers();

  if (!user) {
    return tiers[tiers.length - 1]; // Default tier
  }

  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const accepted = user.stats?.tasksAccepted ?? 0;
  const reliability = user.stats?.reliabilityScore ?? 0;

  for (const tier of tiers) {
    if (accountAgeDays >= tier.minAccountDays &&
        accepted >= tier.minTasksAccepted &&
        reliability >= tier.minReliability) {
      return tier;
    }
  }

  return tiers[tiers.length - 1];
}

// Get next fee tier user can progress to
export async function getNextFeeTier(userId: string): Promise<FeeTierInfo | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { stats: true },
  });

  if (!user) return null;

  const tiers = await getPlatformFeeTiers();
  const currentTier = await getUserFeeTier(userId);

  // Find the next tier (lower tierOrder = better tier)
  const nextTier = tiers.find(t => t.tierOrder < currentTier.tierOrder);
  return nextTier || null;
}

// Get progress toward next tier
export async function getTierProgress(userId: string): Promise<{
  currentTier: FeeTierInfo;
  nextTier: FeeTierInfo | null;
  progress: {
    accountDays: { current: number; required: number; met: boolean };
    tasksAccepted: { current: number; required: number; met: boolean };
    reliability: { current: number; required: number; met: boolean };
  } | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { stats: true },
  });

  const currentTier = await getUserFeeTier(userId);
  const nextTier = await getNextFeeTier(userId);

  if (!user || !nextTier) {
    return { currentTier, nextTier, progress: null };
  }

  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const tasksAccepted = user.stats?.tasksAccepted ?? 0;
  const reliability = user.stats?.reliabilityScore ?? 0;

  return {
    currentTier,
    nextTier,
    progress: {
      accountDays: {
        current: accountAgeDays,
        required: nextTier.minAccountDays,
        met: accountAgeDays >= nextTier.minAccountDays,
      },
      tasksAccepted: {
        current: tasksAccepted,
        required: nextTier.minTasksAccepted,
        met: tasksAccepted >= nextTier.minTasksAccepted,
      },
      reliability: {
        current: reliability,
        required: nextTier.minReliability,
        met: reliability >= nextTier.minReliability,
      },
    },
  };
}

export async function getPlatformFeeRate(requesterId: string): Promise<number> {
  const tier = await getUserFeeTier(requesterId);
  return tier.rate;
}

export async function calculatePlatformFee(requesterId: string, amount: number): Promise<{
  rate: number;
  fee: number;
  tierName: string;
}> {
  const tier = await getUserFeeTier(requesterId);
  return {
    rate: tier.rate,
    fee: amount * tier.rate,
    tierName: tier.name,
  };
}

export async function getArbitrationFeeConfig(): Promise<{ rate: number; min: number; max: number }> {
  const dbConfig = await prisma.feeConfig.findFirst({
    where: { feeType: 'arbitration', isActive: true },
    orderBy: { tierOrder: 'asc' },
  });

  if (dbConfig) {
    return {
      rate: dbConfig.rate,
      min: dbConfig.minFee ?? DEFAULT_ARBITRATION_FEE.min,
      max: dbConfig.maxFee ?? DEFAULT_ARBITRATION_FEE.max,
    };
  }

  return DEFAULT_ARBITRATION_FEE;
}

export async function calculateArbitrationFee(amount: number): Promise<{
  rate: number;
  fee: number;
  min: number;
  max: number;
}> {
  const config = await getArbitrationFeeConfig();
  const fee = clamp(amount * config.rate, config.min, config.max);
  return { ...config, fee };
}

// Full fee preview for a task bounty amount
export async function previewFees(requesterId: string, bountyAmount: number): Promise<{
  bounty: number;
  platformFee: number;
  platformFeeRate: number;
  platformFeeTier: string;
  arbitrationFee: number;
  arbitrationFeeRate: number;
  totalCost: number;
  workerPayout: number;
}> {
  const platformFeeResult = await calculatePlatformFee(requesterId, bountyAmount);
  const arbitrationFeeResult = await calculateArbitrationFee(bountyAmount);

  return {
    bounty: bountyAmount,
    platformFee: platformFeeResult.fee,
    platformFeeRate: platformFeeResult.rate,
    platformFeeTier: platformFeeResult.tierName,
    arbitrationFee: arbitrationFeeResult.fee,
    arbitrationFeeRate: arbitrationFeeResult.rate,
    totalCost: bountyAmount + platformFeeResult.fee + arbitrationFeeResult.fee,
    workerPayout: bountyAmount, // Worker gets full bounty, fees come from requester
  };
}

// Record a fee transaction in the ledger
export async function recordFeeLedgerEntry(params: {
  taskId: string;
  submissionId?: string;
  feeType: 'platform' | 'arbitration';
  amount: number;
  currency: string;
  payerId: string;
  payerWallet?: string;
  txHash?: string;
  blockNumber?: number;
  chainId?: number;
  metadata?: Record<string, any>;
}): Promise<string> {
  const entry = await prisma.ledgerEntry.create({
    data: {
      taskId: params.taskId,
      submissionId: params.submissionId,
      entryType: `fee_${params.feeType}`,
      amount: params.amount,
      currency: params.currency,
      direction: 'debit', // Fees are always debits from user perspective
      counterpartyId: params.payerId,
      walletAddress: params.payerWallet,
      txHash: params.txHash,
      blockNumber: params.blockNumber,
      chainId: params.chainId,
      metadata: JSON.stringify({
        fee_type: params.feeType,
        ...params.metadata,
      }),
    },
  });

  return entry.id;
}

// Get fee history for a user
export async function getUserFeeHistory(userId: string, options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  entries: Array<{
    id: string;
    taskId: string | null;
    feeType: string;
    amount: number;
    currency: string;
    createdAt: Date;
  }>;
  total: number;
  totalFeesPaid: number;
}> {
  const limit = options?.limit || 20;
  const offset = options?.offset || 0;

  const [entries, total, aggregation] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        counterpartyId: userId,
        entryType: { startsWith: 'fee_' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.ledgerEntry.count({
      where: {
        counterpartyId: userId,
        entryType: { startsWith: 'fee_' },
      },
    }),
    prisma.ledgerEntry.aggregate({
      where: {
        counterpartyId: userId,
        entryType: { startsWith: 'fee_' },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    entries: entries.map(e => ({
      id: e.id,
      taskId: e.taskId,
      feeType: e.entryType.replace('fee_', ''),
      amount: e.amount,
      currency: e.currency,
      createdAt: e.createdAt,
    })),
    total,
    totalFeesPaid: aggregation._sum.amount || 0,
  };
}

// Check if user qualifies for a new tier (for notifications)
export async function checkTierPromotion(userId: string): Promise<{
  promoted: boolean;
  previousTier?: FeeTierInfo;
  newTier?: FeeTierInfo;
} | null> {
  // Get user's stored tier from metadata (if we track it)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, uiSettings: true },
  });

  if (!user) return null;

  const currentTier = await getUserFeeTier(userId);

  // Parse stored tier order from UI settings
  let storedSettings: { lastKnownFeeTier?: number } = {};
  try {
    if (typeof user.uiSettings === 'string') {
      storedSettings = JSON.parse(user.uiSettings || '{}');
    } else if (user.uiSettings && typeof user.uiSettings === 'object') {
      storedSettings = user.uiSettings as { lastKnownFeeTier?: number };
    }
  } catch {
    // ignore
  }

  const lastKnownTierOrder = storedSettings.lastKnownFeeTier;

  // If we have a stored tier and current is better (lower order = better)
  if (lastKnownTierOrder !== undefined && currentTier.tierOrder < lastKnownTierOrder) {
    // User has been promoted!
    const allTiers = await getPlatformFeeTiers();
    const previousTier = allTiers.find(t => t.tierOrder === lastKnownTierOrder);

    // Update stored tier
    await prisma.user.update({
      where: { id: userId },
      data: {
        uiSettings: JSON.stringify({
          ...storedSettings,
          lastKnownFeeTier: currentTier.tierOrder,
        }),
      },
    });

    return {
      promoted: true,
      previousTier,
      newTier: currentTier,
    };
  }

  // Update stored tier if not set
  if (lastKnownTierOrder === undefined) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        uiSettings: JSON.stringify({
          ...storedSettings,
          lastKnownFeeTier: currentTier.tierOrder,
        }),
      },
    });
  }

  return { promoted: false };
}

// Initialize default fee configs in database
export async function seedDefaultFeeConfigs(): Promise<void> {
  const existingPlatformConfigs = await prisma.feeConfig.count({
    where: { feeType: 'platform' },
  });

  if (existingPlatformConfigs === 0) {
    // Seed platform fee tiers
    await prisma.feeConfig.createMany({
      data: DEFAULT_PLATFORM_FEE_TIERS.map(t => ({
        feeType: 'platform',
        name: t.name,
        description: `${(t.rate * 100).toFixed(0)}% platform fee tier`,
        tierOrder: t.tierOrder,
        minAccountDays: t.minDays,
        minTasksAccepted: t.minAccepted,
        minReliability: t.minReliability,
        rate: t.rate,
      })),
    });
  }

  const existingArbitrationConfig = await prisma.feeConfig.count({
    where: { feeType: 'arbitration' },
  });

  if (existingArbitrationConfig === 0) {
    // Seed arbitration fee config
    await prisma.feeConfig.create({
      data: {
        feeType: 'arbitration',
        name: 'Dispute Resolution',
        description: 'Fee for arbitration services on disputed submissions',
        tierOrder: 0,
        rate: DEFAULT_ARBITRATION_FEE.rate,
        minFee: DEFAULT_ARBITRATION_FEE.min,
        maxFee: DEFAULT_ARBITRATION_FEE.max,
      },
    });
  }
}

// Admin: Update fee config
export async function updateFeeConfig(
  configId: string,
  updates: {
    name?: string;
    description?: string;
    rate?: number;
    minFee?: number;
    maxFee?: number;
    minAccountDays?: number;
    minTasksAccepted?: number;
    minReliability?: number;
    isActive?: boolean;
  }
): Promise<any> {
  return prisma.feeConfig.update({
    where: { id: configId },
    data: updates,
  });
}

// Admin: Get all fee configs
export async function getAllFeeConfigs(): Promise<any[]> {
  return prisma.feeConfig.findMany({
    orderBy: [{ feeType: 'asc' }, { tierOrder: 'asc' }],
  });
}

// Admin: Get fee statistics
export async function getFeeStatistics(options?: {
  startDate?: Date;
  endDate?: Date;
}): Promise<{
  totalPlatformFees: number;
  totalArbitrationFees: number;
  feesByTier: Record<string, number>;
  transactionCount: number;
}> {
  const where: any = {
    entryType: { startsWith: 'fee_' },
  };

  if (options?.startDate) {
    where.createdAt = { gte: options.startDate };
  }
  if (options?.endDate) {
    where.createdAt = { ...where.createdAt, lte: options.endDate };
  }

  const [platformAgg, arbitrationAgg, allEntries] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { ...where, entryType: 'fee_platform' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.ledgerEntry.aggregate({
      where: { ...where, entryType: 'fee_arbitration' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.ledgerEntry.findMany({
      where,
      select: { metadata: true, amount: true },
    }),
  ]);

  // Calculate fees by tier from metadata
  const feesByTier: Record<string, number> = {};
  for (const entry of allEntries) {
    try {
      let meta: Record<string, any> = {};
      if (typeof entry.metadata === 'string') {
        meta = JSON.parse(entry.metadata);
      } else if (entry.metadata && typeof entry.metadata === 'object') {
        meta = entry.metadata as Record<string, any>;
      }
      const tier = meta.tier_name || 'unknown';
      feesByTier[tier] = (feesByTier[tier] || 0) + entry.amount;
    } catch {
      // ignore
    }
  }

  return {
    totalPlatformFees: platformAgg._sum.amount || 0,
    totalArbitrationFees: arbitrationAgg._sum.amount || 0,
    feesByTier,
    transactionCount: (platformAgg._count || 0) + (arbitrationAgg._count || 0),
  };
}
