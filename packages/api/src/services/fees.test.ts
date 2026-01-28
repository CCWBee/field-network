import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from './database';
import {
  getPlatformFeeTiers,
  getUserFeeTier,
  calculatePlatformFee,
  calculateArbitrationFee,
  previewFees,
  getNextFeeTier,
  getTierProgress,
  seedDefaultFeeConfigs,
} from './fees';

describe('Fee Service', () => {
  let testUserId: string;
  let establishedUserId: string;
  let eliteUserId: string;

  beforeAll(async () => {
    // Seed default fee configs
    await seedDefaultFeeConfigs();

    // Create test users with different profiles
    const newUser = await prisma.user.create({
      data: {
        email: 'newuser-fee-test@test.com',
        passwordHash: 'test',
        role: 'requester',
        status: 'active',
        createdAt: new Date(), // Just created
      },
    });
    testUserId = newUser.id;

    // Create stats for new user
    await prisma.userStats.create({
      data: {
        userId: testUserId,
        tasksAccepted: 0,
        reliabilityScore: 50,
      },
    });

    // Established user (30+ days, 5+ tasks, 70%+ reliability)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 35);

    const establishedUser = await prisma.user.create({
      data: {
        email: 'established-fee-test@test.com',
        passwordHash: 'test',
        role: 'requester',
        status: 'active',
        createdAt: thirtyDaysAgo,
      },
    });
    establishedUserId = establishedUser.id;

    await prisma.userStats.create({
      data: {
        userId: establishedUserId,
        tasksAccepted: 10,
        reliabilityScore: 75,
      },
    });

    // Elite user (180+ days, 50+ tasks, 90%+ reliability)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 200);

    const eliteUser = await prisma.user.create({
      data: {
        email: 'elite-fee-test@test.com',
        passwordHash: 'test',
        role: 'requester',
        status: 'active',
        createdAt: sixMonthsAgo,
      },
    });
    eliteUserId = eliteUser.id;

    await prisma.userStats.create({
      data: {
        userId: eliteUserId,
        tasksAccepted: 60,
        reliabilityScore: 95,
      },
    });
  });

  afterAll(async () => {
    // Clean up test users
    await prisma.userStats.deleteMany({
      where: { userId: { in: [testUserId, establishedUserId, eliteUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, establishedUserId, eliteUserId] } },
    });
  });

  describe('getPlatformFeeTiers', () => {
    it('should return fee tiers in order', async () => {
      const tiers = await getPlatformFeeTiers();

      expect(tiers.length).toBeGreaterThan(0);
      expect(tiers[0].tierOrder).toBeLessThan(tiers[tiers.length - 1].tierOrder);
    });

    it('should have valid tier data', async () => {
      const tiers = await getPlatformFeeTiers();

      for (const tier of tiers) {
        expect(tier.name).toBeTruthy();
        expect(tier.rate).toBeGreaterThanOrEqual(0);
        expect(tier.rate).toBeLessThanOrEqual(1);
        expect(tier.minAccountDays).toBeGreaterThanOrEqual(0);
        expect(tier.minTasksAccepted).toBeGreaterThanOrEqual(0);
        expect(tier.minReliability).toBeGreaterThanOrEqual(0);
        expect(tier.minReliability).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('getUserFeeTier', () => {
    it('should return Standard tier for new users', async () => {
      const tier = await getUserFeeTier(testUserId);

      expect(tier.name).toBe('Standard');
      expect(tier.rate).toBe(0.1); // 10%
    });

    it('should return Established tier for qualifying users', async () => {
      const tier = await getUserFeeTier(establishedUserId);

      expect(tier.name).toBe('Established');
      expect(tier.rate).toBe(0.08); // 8%
    });

    it('should return Elite tier for top users', async () => {
      const tier = await getUserFeeTier(eliteUserId);

      expect(tier.name).toBe('Elite');
      expect(tier.rate).toBe(0.05); // 5%
    });

    it('should return default tier for non-existent user', async () => {
      const tier = await getUserFeeTier('non-existent-user-id');

      expect(tier.name).toBe('Standard');
    });
  });

  describe('calculatePlatformFee', () => {
    it('should calculate correct fee for Standard tier', async () => {
      const result = await calculatePlatformFee(testUserId, 100);

      expect(result.rate).toBe(0.1);
      expect(result.fee).toBe(10);
      expect(result.tierName).toBe('Standard');
    });

    it('should calculate correct fee for Established tier', async () => {
      const result = await calculatePlatformFee(establishedUserId, 100);

      expect(result.rate).toBe(0.08);
      expect(result.fee).toBe(8);
      expect(result.tierName).toBe('Established');
    });

    it('should calculate correct fee for Elite tier', async () => {
      const result = await calculatePlatformFee(eliteUserId, 100);

      expect(result.rate).toBe(0.05);
      expect(result.fee).toBe(5);
      expect(result.tierName).toBe('Elite');
    });

    it('should handle zero amount', async () => {
      const result = await calculatePlatformFee(testUserId, 0);

      expect(result.fee).toBe(0);
    });

    it('should handle very small amounts', async () => {
      const result = await calculatePlatformFee(testUserId, 0.01);

      expect(result.fee).toBe(0.001);
    });

    it('should handle large amounts', async () => {
      const result = await calculatePlatformFee(testUserId, 10000);

      expect(result.fee).toBe(1000);
    });
  });

  describe('calculateArbitrationFee', () => {
    it('should calculate fee within min/max bounds', async () => {
      const result = await calculateArbitrationFee(100);

      expect(result.fee).toBeGreaterThanOrEqual(result.min);
      expect(result.fee).toBeLessThanOrEqual(result.max);
    });

    it('should apply minimum fee for small amounts', async () => {
      const result = await calculateArbitrationFee(10);

      // 2% of 10 = 0.20, but min is 2
      expect(result.fee).toBe(2);
    });

    it('should apply maximum fee for large amounts', async () => {
      const result = await calculateArbitrationFee(10000);

      // 2% of 10000 = 200, but max is 50
      expect(result.fee).toBe(50);
    });

    it('should apply rate for medium amounts', async () => {
      const result = await calculateArbitrationFee(500);

      // 2% of 500 = 10, within min/max range
      expect(result.fee).toBe(10);
    });
  });

  describe('previewFees', () => {
    it('should return complete fee breakdown', async () => {
      const preview = await previewFees(testUserId, 100);

      expect(preview.bounty).toBe(100);
      expect(preview.platformFee).toBe(10);
      expect(preview.platformFeeRate).toBe(0.1);
      expect(preview.platformFeeTier).toBe('Standard');
      expect(preview.arbitrationFee).toBe(2); // min fee
      expect(preview.totalCost).toBe(112); // 100 + 10 + 2
      expect(preview.workerPayout).toBe(100);
    });

    it('should calculate total cost correctly', async () => {
      const preview = await previewFees(eliteUserId, 500);

      const expectedTotal = preview.bounty + preview.platformFee + preview.arbitrationFee;
      expect(preview.totalCost).toBe(expectedTotal);
    });

    it('should show worker gets full bounty', async () => {
      const preview = await previewFees(testUserId, 50);

      expect(preview.workerPayout).toBe(preview.bounty);
    });
  });

  describe('getNextFeeTier', () => {
    it('should return next tier for Standard users', async () => {
      const nextTier = await getNextFeeTier(testUserId);

      expect(nextTier).toBeTruthy();
      expect(nextTier!.name).toBe('Established');
    });

    it('should return null for Elite users', async () => {
      const nextTier = await getNextFeeTier(eliteUserId);

      expect(nextTier).toBeNull();
    });
  });

  describe('getTierProgress', () => {
    it('should return progress for non-elite users', async () => {
      const progress = await getTierProgress(testUserId);

      expect(progress.currentTier.name).toBe('Standard');
      expect(progress.nextTier).toBeTruthy();
      expect(progress.progress).toBeTruthy();
      expect(progress.progress!.accountDays).toBeTruthy();
      expect(progress.progress!.tasksAccepted).toBeTruthy();
      expect(progress.progress!.reliability).toBeTruthy();
    });

    it('should return null progress for elite users', async () => {
      const progress = await getTierProgress(eliteUserId);

      expect(progress.currentTier.name).toBe('Elite');
      expect(progress.nextTier).toBeNull();
      expect(progress.progress).toBeNull();
    });

    it('should mark met requirements correctly', async () => {
      const progress = await getTierProgress(establishedUserId);

      // Established user should have some requirements met for next tier
      expect(progress.progress).toBeTruthy();
      const allMet = progress.progress!.accountDays.met &&
                     progress.progress!.tasksAccepted.met &&
                     progress.progress!.reliability.met;
      // Not all met since they're not at next tier yet
      expect(allMet).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative amounts gracefully', async () => {
      const result = await calculatePlatformFee(testUserId, -100);

      expect(result.fee).toBe(-10); // Mathematical result
    });

    it('should handle NaN amounts', async () => {
      const result = await calculatePlatformFee(testUserId, NaN);

      expect(isNaN(result.fee)).toBe(true);
    });

    it('should handle decimal amounts with precision', async () => {
      const result = await calculatePlatformFee(testUserId, 99.99);

      expect(result.fee).toBeCloseTo(9.999, 3);
    });

    it('should handle very large amounts', async () => {
      const result = await calculatePlatformFee(testUserId, 1000000);

      expect(result.fee).toBe(100000);
    });

    it('should handle concurrent fee calculations', async () => {
      const results = await Promise.all([
        calculatePlatformFee(testUserId, 100),
        calculatePlatformFee(establishedUserId, 100),
        calculatePlatformFee(eliteUserId, 100),
      ]);

      expect(results[0].tierName).toBe('Standard');
      expect(results[1].tierName).toBe('Established');
      expect(results[2].tierName).toBe('Elite');
    });
  });
});
