/**
 * Database Integration Tests
 *
 * These tests verify critical database operations work correctly
 * with the production database configuration (PostgreSQL).
 *
 * Tests cover:
 * - User creation and authentication
 * - Task lifecycle (create, publish, claim, submit, accept)
 * - Submission and verification flow
 * - Foreign key integrity
 * - JSON field handling
 * - Transaction behavior
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Database Integration Tests', () => {
  // Test data
  let testUserId: string;
  let testTaskId: string;
  let testSubmissionId: string;

  beforeAll(async () => {
    // Ensure database is connected
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up test data
    if (testSubmissionId) {
      await prisma.submission.deleteMany({ where: { id: testSubmissionId } });
    }
    if (testTaskId) {
      await prisma.task.deleteMany({ where: { id: testTaskId } });
    }
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }

    await prisma.$disconnect();
  });

  describe('User Operations', () => {
    it('should create a user with all fields', async () => {
      const user = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@example.com`,
          passwordHash: 'hashed_password_123',
          role: 'worker',
          username: `testuser_${Date.now()}`,
          bio: 'Test user for integration tests',
          location: 'Test City',
          onboardingCompleted: true,
          notificationPrefs: { email: true, push: false },
          uiSettings: { theme: 'light' },
          defaultRightsJson: { exclusivityDays: 7 },
          savedAddresses: [{ label: 'Home', lat: 51.5074, lon: -0.1278 }],
        },
      });

      expect(user.id).toBeDefined();
      expect(user.email).toContain('test-');
      expect(user.role).toBe('worker');
      expect(user.notificationPrefs).toEqual({ email: true, push: false });
      expect(user.savedAddresses).toBeInstanceOf(Array);

      testUserId = user.id;
    });

    it('should create user stats', async () => {
      const stats = await prisma.userStats.create({
        data: {
          userId: testUserId,
          tasksPosted: 0,
          tasksCompleted: 0,
          reliabilityScore: 100,
          currentStreak: 0,
        },
      });

      expect(stats.userId).toBe(testUserId);
      expect(stats.reliabilityScore).toBe(100);
    });

    it('should create a wallet link', async () => {
      const wallet = await prisma.walletLink.create({
        data: {
          userId: testUserId,
          walletAddress: `0x${Date.now().toString(16)}${'0'.repeat(24)}`,
          chain: 'base',
          chainId: 8453,
          isPrimary: true,
          label: 'Test Wallet',
          verifiedAt: new Date(),
        },
      });

      expect(wallet.userId).toBe(testUserId);
      expect(wallet.chain).toBe('base');
    });

    it('should retrieve user with relations', async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
        include: {
          stats: true,
          walletLinks: true,
        },
      });

      expect(user).not.toBeNull();
      expect(user?.stats).toBeDefined();
      expect(user?.walletLinks.length).toBeGreaterThan(0);
    });
  });

  describe('Task Operations', () => {
    it('should create a task with JSON fields', async () => {
      const task = await prisma.task.create({
        data: {
          requesterId: testUserId,
          template: 'geo_photo_v1',
          title: 'Integration Test Task',
          instructions: 'This is a test task for database integration tests.',
          status: 'draft',
          locationLat: 51.5074,
          locationLon: -0.1278,
          radiusM: 100,
          timeStart: new Date(),
          timeEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          requirementsJson: {
            minWidth: 1920,
            minHeight: 1080,
            gpsRequired: true,
          },
          bountyAmount: 25.0,
          currency: 'USDC',
          policyFlags: ['test_flag'],
        },
      });

      expect(task.id).toBeDefined();
      expect(task.status).toBe('draft');
      expect(task.requirementsJson).toEqual({
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      });

      testTaskId = task.id;
    });

    it('should update task status', async () => {
      const task = await prisma.task.update({
        where: { id: testTaskId },
        data: {
          status: 'posted',
          publishedAt: new Date(),
        },
      });

      expect(task.status).toBe('posted');
      expect(task.publishedAt).toBeDefined();
    });

    it('should create a task claim', async () => {
      const claim = await prisma.taskClaim.create({
        data: {
          taskId: testTaskId,
          workerId: testUserId,
          claimedAt: new Date(),
          claimedUntil: new Date(Date.now() + 4 * 60 * 60 * 1000),
          status: 'active',
        },
      });

      expect(claim.taskId).toBe(testTaskId);
      expect(claim.status).toBe('active');

      // Update task status to claimed
      await prisma.task.update({
        where: { id: testTaskId },
        data: { status: 'claimed' },
      });
    });
  });

  describe('Submission Flow', () => {
    it('should create a submission with JSON fields', async () => {
      const submission = await prisma.submission.create({
        data: {
          taskId: testTaskId,
          workerId: testUserId,
          status: 'created',
          proofBundleJson: {
            version: '1.0',
            artefacts: [],
            timestamp: new Date().toISOString(),
          },
          verificationJson: {
            gpsValid: true,
            distanceMeters: 50,
          },
          verificationScore: 95,
          flagsJson: [],
        },
      });

      expect(submission.id).toBeDefined();
      expect(submission.proofBundleJson).toHaveProperty('version', '1.0');
      expect(submission.verificationScore).toBe(95);

      testSubmissionId = submission.id;
    });

    it('should create an artefact', async () => {
      const artefact = await prisma.artefact.create({
        data: {
          submissionId: testSubmissionId,
          type: 'photo',
          storageKey: `test-${Date.now()}.jpg`,
          sha256: 'abc123def456',
          sizeBytes: 1024000,
          widthPx: 1920,
          heightPx: 1080,
          exifJson: {
            make: 'Test Camera',
            model: 'Test Model',
            dateTime: new Date().toISOString(),
          },
          gpsLat: 51.5074,
          gpsLon: -0.1278,
        },
      });

      expect(artefact.id).toBeDefined();
      expect(artefact.exifJson).toHaveProperty('make', 'Test Camera');
    });

    it('should finalize and accept submission', async () => {
      // Finalize
      await prisma.submission.update({
        where: { id: testSubmissionId },
        data: {
          status: 'finalised',
          finalisedAt: new Date(),
        },
      });

      // Create decision
      const decision = await prisma.decision.create({
        data: {
          submissionId: testSubmissionId,
          actorId: testUserId,
          decisionType: 'accept',
          comment: 'Integration test acceptance',
        },
      });

      expect(decision.decisionType).toBe('accept');

      // Accept
      await prisma.submission.update({
        where: { id: testSubmissionId },
        data: { status: 'accepted' },
      });

      await prisma.task.update({
        where: { id: testTaskId },
        data: { status: 'accepted' },
      });
    });
  });

  describe('Foreign Key Integrity', () => {
    it('should cascade delete user relations', async () => {
      // Create a temporary user for cascade test
      const tempUser = await prisma.user.create({
        data: {
          email: `cascade-test-${Date.now()}@example.com`,
          role: 'worker',
        },
      });

      // Create related records
      await prisma.walletLink.create({
        data: {
          userId: tempUser.id,
          walletAddress: `0x${Date.now().toString(16)}cascade`,
          chain: 'base',
          chainId: 8453,
        },
      });

      await prisma.userStats.create({
        data: {
          userId: tempUser.id,
        },
      });

      // Delete user (should cascade)
      await prisma.user.delete({
        where: { id: tempUser.id },
      });

      // Verify cascade
      const wallets = await prisma.walletLink.findMany({
        where: { userId: tempUser.id },
      });
      expect(wallets.length).toBe(0);

      const stats = await prisma.userStats.findFirst({
        where: { userId: tempUser.id },
      });
      expect(stats).toBeNull();
    });

    it('should prevent orphan records', async () => {
      // Attempt to create a task with non-existent requester
      await expect(
        prisma.task.create({
          data: {
            requesterId: 'non-existent-user-id',
            template: 'test',
            title: 'Should Fail',
            instructions: 'Test',
            status: 'draft',
            locationLat: 0,
            locationLon: 0,
            radiusM: 100,
            timeStart: new Date(),
            timeEnd: new Date(),
            requirementsJson: {},
            bountyAmount: 10,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Transaction Behavior', () => {
    it('should rollback transaction on error', async () => {
      const tempUser = await prisma.user.create({
        data: {
          email: `tx-test-${Date.now()}@example.com`,
          role: 'worker',
        },
      });

      try {
        await prisma.$transaction(async (tx) => {
          // This should succeed
          await tx.userStats.create({
            data: {
              userId: tempUser.id,
              reliabilityScore: 100,
            },
          });

          // This should fail (duplicate unique constraint)
          await tx.userStats.create({
            data: {
              userId: tempUser.id, // Same user - will violate unique constraint
              reliabilityScore: 50,
            },
          });
        });

        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected - transaction should have rolled back
        expect(error).toBeDefined();
      }

      // Verify rollback - no stats should exist
      const stats = await prisma.userStats.findFirst({
        where: { userId: tempUser.id },
      });
      expect(stats).toBeNull();

      // Clean up
      await prisma.user.delete({ where: { id: tempUser.id } });
    });

    it('should commit successful transaction', async () => {
      const tempUser = await prisma.user.create({
        data: {
          email: `tx-success-${Date.now()}@example.com`,
          role: 'worker',
        },
      });

      await prisma.$transaction(async (tx) => {
        await tx.userStats.create({
          data: {
            userId: tempUser.id,
            reliabilityScore: 100,
          },
        });

        await tx.walletLink.create({
          data: {
            userId: tempUser.id,
            walletAddress: `0x${Date.now().toString(16)}txtest`,
            chain: 'base',
            chainId: 8453,
          },
        });
      });

      // Verify commit
      const user = await prisma.user.findUnique({
        where: { id: tempUser.id },
        include: { stats: true, walletLinks: true },
      });

      expect(user?.stats).toBeDefined();
      expect(user?.walletLinks.length).toBe(1);

      // Clean up
      await prisma.user.delete({ where: { id: tempUser.id } });
    });
  });

  describe('Query Performance', () => {
    it('should handle complex queries efficiently', async () => {
      const startTime = Date.now();

      // Complex query with joins and filters
      const tasks = await prisma.task.findMany({
        where: {
          status: { in: ['posted', 'claimed'] },
          bountyAmount: { gte: 10 },
        },
        include: {
          requester: {
            include: {
              stats: true,
            },
          },
          claims: {
            where: { status: 'active' },
          },
          submissions: {
            include: {
              artefacts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const duration = Date.now() - startTime;

      // Query should complete in reasonable time
      expect(duration).toBeLessThan(5000); // 5 second timeout
      expect(tasks).toBeDefined();
    });
  });
});
