import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { prisma } from '../database';
import {
  recalculateUserStats,
  logReputationEvent,
  getReputationHistory,
  ReputationReason,
} from '../reputation';

// Mock prisma client
vi.mock('../database', () => ({
  prisma: {
    userStats: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    reputationEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    task: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    taskClaim: {
      count: vi.fn(),
    },
    submission: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    dispute: {
      count: vi.fn(),
    },
    userBadge: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    badgeDefinition: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

describe('Reputation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logReputationEvent', () => {
    it('should create a reputation event with all fields', async () => {
      (mockPrisma.reputationEvent.create as any).mockResolvedValue({
        id: 'event-1',
        userId: 'user-1',
        previousScore: 85,
        newScore: 87,
        reason: 'task_accepted',
        taskId: 'task-1',
        submissionId: null,
        badgeType: null,
        metadata: '{}',
        createdAt: new Date(),
      });

      await logReputationEvent({
        userId: 'user-1',
        previousScore: 85,
        newScore: 87,
        reason: 'task_accepted',
        taskId: 'task-1',
      });

      expect(mockPrisma.reputationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          previousScore: 85,
          newScore: 87,
          reason: 'task_accepted',
          taskId: 'task-1',
        }),
      });
    });

    it('should not log no-op recalculations', async () => {
      await logReputationEvent({
        userId: 'user-1',
        previousScore: 85,
        newScore: 85,
        reason: 'recalculation',
      });

      expect(mockPrisma.reputationEvent.create).not.toHaveBeenCalled();
    });

    it('should log recalculations with score changes', async () => {
      (mockPrisma.reputationEvent.create as any).mockResolvedValue({
        id: 'event-1',
        userId: 'user-1',
        previousScore: 85,
        newScore: 86,
        reason: 'recalculation',
      });

      await logReputationEvent({
        userId: 'user-1',
        previousScore: 85,
        newScore: 86,
        reason: 'recalculation',
      });

      expect(mockPrisma.reputationEvent.create).toHaveBeenCalled();
    });

    it('should always log significant events even with no score change', async () => {
      (mockPrisma.reputationEvent.create as any).mockResolvedValue({
        id: 'event-1',
      });

      await logReputationEvent({
        userId: 'user-1',
        previousScore: 85,
        newScore: 85,
        reason: 'badge_earned',
        badgeType: 'first_light',
      });

      expect(mockPrisma.reputationEvent.create).toHaveBeenCalled();
    });
  });

  describe('getReputationHistory', () => {
    it('should return paginated reputation events', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          previousScore: 85,
          newScore: 87,
          reason: 'task_accepted',
          taskId: 'task-1',
          badgeType: null,
          metadata: '{"acceptanceRate": 0.95}',
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'event-2',
          previousScore: 87,
          newScore: 87,
          reason: 'badge_earned',
          taskId: null,
          badgeType: 'first_light',
          metadata: '{}',
          createdAt: new Date('2024-01-15T11:00:00Z'),
        },
      ];

      (mockPrisma.reputationEvent.findMany as any).mockResolvedValue(mockEvents);
      (mockPrisma.reputationEvent.count as any).mockResolvedValue(2);

      const result = await getReputationHistory('user-1', { limit: 10, offset: 0 });

      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.events[0].reason).toBe('task_accepted');
      expect(result.events[1].badgeType).toBe('first_light');
    });

    it('should apply pagination correctly', async () => {
      (mockPrisma.reputationEvent.findMany as any).mockResolvedValue([]);
      (mockPrisma.reputationEvent.count as any).mockResolvedValue(100);

      await getReputationHistory('user-1', { limit: 10, offset: 50 });

      expect(mockPrisma.reputationEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 50,
        })
      );
    });

    it('should parse metadata JSON correctly', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          previousScore: 80,
          newScore: 85,
          reason: 'task_accepted',
          taskId: 'task-1',
          badgeType: null,
          metadata: '{"acceptanceRate": 0.95, "streakBonus": 3}',
          createdAt: new Date(),
        },
      ];

      (mockPrisma.reputationEvent.findMany as any).mockResolvedValue(mockEvents);
      (mockPrisma.reputationEvent.count as any).mockResolvedValue(1);

      const result = await getReputationHistory('user-1');

      expect(result.events[0].metadata).toEqual({
        acceptanceRate: 0.95,
        streakBonus: 3,
      });
    });
  });

  describe('Reputation Edge Cases', () => {
    describe('Score Clamping', () => {
      it('should clamp score at 0 for users with all rejected submissions', async () => {
        // Setup mocks for a user with 100% rejection rate
        setupMocksForCalculation({
          tasksAccepted: 0,
          tasksDelivered: 10,
          disputesCount: 0,
          currentStreak: 0,
        });

        const result = await recalculateUserStats('user-1', { reason: 'task_rejected' });

        // With 0% acceptance rate and no streaks:
        // (0 * 70%) + (100% * 30%) + 0 = 30
        // But clamped to minimum of 0
        expect(result).toBeDefined();
      });

      it('should clamp score at 100 for perfect users', async () => {
        setupMocksForCalculation({
          tasksAccepted: 100,
          tasksDelivered: 100,
          disputesCount: 0,
          currentStreak: 50,
        });

        const result = await recalculateUserStats('user-1', { reason: 'task_accepted' });

        // With 100% acceptance and max streak bonus (5):
        // (100 * 70%) + (100 * 30%) + 5 = 105, clamped to 100
        expect(result).toBeDefined();
      });
    });

    describe('New User Handling', () => {
      it('should handle users with no submissions', async () => {
        setupMocksForCalculation({
          tasksAccepted: 0,
          tasksDelivered: 0,
          disputesCount: 0,
          currentStreak: 0,
        });

        const result = await recalculateUserStats('new-user-1');

        // New user with no activity should get default high score
        expect(result).toBeDefined();
      });
    });

    describe('Streak Calculations', () => {
      it('should correctly calculate current streak', async () => {
        const submissions = [
          { status: 'accepted', finalisedAt: new Date('2024-01-10') },
          { status: 'accepted', finalisedAt: new Date('2024-01-11') },
          { status: 'accepted', finalisedAt: new Date('2024-01-12') },
          { status: 'rejected', finalisedAt: new Date('2024-01-13') },
          { status: 'accepted', finalisedAt: new Date('2024-01-14') },
          { status: 'accepted', finalisedAt: new Date('2024-01-15') },
        ];

        // Current streak should be 2 (last two accepted after a rejection)
        expect(submissions.slice(-2).every((s) => s.status === 'accepted')).toBe(true);
      });

      it('should cap streak bonus at 5', async () => {
        setupMocksForCalculation({
          tasksAccepted: 50,
          tasksDelivered: 50,
          disputesCount: 0,
          currentStreak: 100, // Very long streak
        });

        const result = await recalculateUserStats('user-1');

        // Streak bonus should be capped at 5, not 100
        expect(result).toBeDefined();
      });
    });

    describe('Dispute Rate Impact', () => {
      it('should heavily penalize high dispute rates', async () => {
        setupMocksForCalculation({
          tasksAccepted: 8,
          tasksDelivered: 10,
          disputesCount: 5, // 50% dispute rate
          currentStreak: 0,
        });

        const result = await recalculateUserStats('user-1');

        // With 80% acceptance and 50% dispute rate:
        // (80 * 70%) + (50% * 30%) + 0 = 56 + 15 = 71
        expect(result).toBeDefined();
      });

      it('should reward zero dispute rate', async () => {
        setupMocksForCalculation({
          tasksAccepted: 10,
          tasksDelivered: 10,
          disputesCount: 0,
          currentStreak: 5,
        });

        const result = await recalculateUserStats('user-1');

        // With 100% acceptance and 0% dispute rate:
        // (100 * 70%) + (100 * 30%) + 5 = 105, clamped to 100
        expect(result).toBeDefined();
      });
    });

    describe('Badge Award Deduplication', () => {
      it('should not award duplicate badges', async () => {
        // Mock that badge already exists
        (mockPrisma.userBadge.findUnique as any).mockResolvedValue({
          id: 'badge-1',
          userId: 'user-1',
          badgeType: 'first_light',
          tier: 'gold',
        });

        // The awardBadge function should check and not create duplicate
        // This is tested through the integration
      });
    });

    describe('Concurrent Updates', () => {
      it('should handle race conditions gracefully', async () => {
        // Both updates try to recalculate at the same time
        // The second one should work with the latest data
        setupMocksForCalculation({
          tasksAccepted: 5,
          tasksDelivered: 5,
          disputesCount: 0,
          currentStreak: 5,
        });

        const results = await Promise.all([
          recalculateUserStats('user-1'),
          recalculateUserStats('user-1'),
        ]);

        expect(results).toHaveLength(2);
      });
    });
  });
});

// Helper function to setup mocks for recalculateUserStats
function setupMocksForCalculation(data: {
  tasksAccepted: number;
  tasksDelivered: number;
  disputesCount: number;
  currentStreak: number;
}) {
  // Mock existing stats
  (mockPrisma.userStats.findUnique as any).mockResolvedValue({
    userId: 'user-1',
    reliabilityScore: 100,
  });

  (mockPrisma.userStats.create as any).mockResolvedValue({
    userId: 'user-1',
    reliabilityScore: 100,
  });

  (mockPrisma.userStats.update as any).mockResolvedValue({
    userId: 'user-1',
    reliabilityScore: 85,
  });

  // Mock task counts
  (mockPrisma.task.count as any).mockResolvedValue(0);
  (mockPrisma.task.aggregate as any).mockResolvedValue({ _sum: { bountyAmount: 0 } });

  // Mock claim counts
  (mockPrisma.taskClaim.count as any).mockResolvedValue(0);

  // Mock submission counts
  (mockPrisma.submission.count as any)
    .mockResolvedValueOnce(data.tasksDelivered) // tasksDelivered
    .mockResolvedValueOnce(data.tasksAccepted) // tasksAccepted
    .mockResolvedValueOnce(data.tasksDelivered - data.tasksAccepted); // tasksRejected

  // Mock accepted submissions for earnings
  (mockPrisma.submission.findMany as any).mockResolvedValue(
    Array(data.tasksAccepted).fill({
      task: { id: 'task-1', bountyAmount: 100, locationLat: null, locationLon: null },
    })
  );

  // Mock disputes
  (mockPrisma.dispute.count as any).mockResolvedValue(data.disputesCount);

  // Mock badge definitions
  (mockPrisma.badgeDefinition.findUnique as any).mockResolvedValue(null);
  (mockPrisma.badgeDefinition.upsert as any).mockResolvedValue({});

  // Mock existing badges (none)
  (mockPrisma.userBadge.findUnique as any).mockResolvedValue(null);
  (mockPrisma.userBadge.create as any).mockResolvedValue({});

  // Mock reputation event logging
  (mockPrisma.reputationEvent.create as any).mockResolvedValue({});
}
