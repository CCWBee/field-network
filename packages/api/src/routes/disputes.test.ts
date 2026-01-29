import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../services/database';

describe('Dispute Resolution', () => {
  let adminUserId: string;
  let requesterId: string;
  let workerId: string;
  let taskId: string;
  let submissionId: string;
  let disputeId: string;

  beforeAll(async () => {
    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email: 'admin-dispute-test@test.com',
        passwordHash: 'test',
        role: 'admin',
        status: 'active',
      },
    });
    adminUserId = admin.id;

    // Create requester user
    const requester = await prisma.user.create({
      data: {
        email: 'requester-dispute-test@test.com',
        passwordHash: 'test',
        role: 'requester',
        status: 'active',
      },
    });
    requesterId = requester.id;

    // Create worker user
    const worker = await prisma.user.create({
      data: {
        email: 'worker-dispute-test@test.com',
        passwordHash: 'test',
        role: 'worker',
        status: 'active',
      },
    });
    workerId = worker.id;

    // Create wallet link for worker
    await prisma.walletLink.create({
      data: {
        userId: workerId,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chain: 'base',
        chainId: 8453,
        isPrimary: true,
      },
    });

    // Create user stats
    await prisma.userStats.create({
      data: {
        userId: workerId,
        reliabilityScore: 80,
        tasksCompleted: 5,
        tasksAccepted: 5,
        totalEarned: 250,
      },
    });

    await prisma.userStats.create({
      data: {
        userId: requesterId,
        reliabilityScore: 90,
        tasksPosted: 10,
        tasksCompleted: 8,
        totalBountiesPaid: 500,
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse order of dependencies
    await prisma.disputeAuditLog.deleteMany({
      where: { disputeId },
    });
    await prisma.dispute.deleteMany({
      where: { submissionId },
    });
    await prisma.ledgerEntry.deleteMany({
      where: { taskId },
    });
    await prisma.escrow.deleteMany({
      where: { taskId },
    });
    await prisma.artefact.deleteMany({
      where: { submissionId },
    });
    await prisma.submission.deleteMany({
      where: { taskId },
    });
    await prisma.taskClaim.deleteMany({
      where: { taskId },
    });
    await prisma.task.deleteMany({
      where: { id: taskId },
    });
    await prisma.walletLink.deleteMany({
      where: { userId: workerId },
    });
    await prisma.userStats.deleteMany({
      where: { userId: { in: [workerId, requesterId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUserId, requesterId, workerId] } },
    });
  });

  beforeEach(async () => {
    // Create fresh task for each test
    const now = new Date();
    const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

    const task = await prisma.task.create({
      data: {
        requesterId,
        title: 'Test Task for Dispute',
        instructions: 'Take a photo of the location',
        status: 'disputed',
        locationLat: 51.5074,
        locationLon: -0.1278,
        radiusM: 100,
        timeStart: now,
        timeEnd: endTime,
        requirementsJson: {},
        bountyAmount: 50,
        currency: 'USDC',
      },
    });
    taskId = task.id;

    // Create escrow
    await prisma.escrow.create({
      data: {
        taskId,
        provider: 'mock',
        amount: 50,
        currency: 'USDC',
        status: 'funded',
        fundedAt: new Date(),
        createdBy: requesterId,
      },
    });

    // Create submission
    const submission = await prisma.submission.create({
      data: {
        taskId,
        workerId,
        status: 'disputed',
        verificationScore: 75,
        proofBundleHash: 'abc123',
        flagsJson: JSON.stringify(['location_mismatch']),
        finalisedAt: new Date(),
      },
    });
    submissionId = submission.id;

    // Create artefact
    await prisma.artefact.create({
      data: {
        submissionId,
        type: 'photo',
        storageKey: `test/${submissionId}/photo1.jpg`,
        sha256: 'abc123def456',
        sizeBytes: 1024,
        widthPx: 800,
        heightPx: 600,
        gpsLat: 51.5074,
        gpsLon: -0.1278,
      },
    });

    // Create dispute
    const dispute = await prisma.dispute.create({
      data: {
        submissionId,
        openedBy: requesterId,
        status: 'opened',
      },
    });
    disputeId = dispute.id;

    // Create initial audit log
    await prisma.disputeAuditLog.create({
      data: {
        disputeId,
        action: 'created',
        actorId: requesterId,
        detailsJson: JSON.stringify({ reason: 'Location mismatch detected' }),
      },
    });
  });

  describe('Dispute Model', () => {
    it('should have splitPercentage field', async () => {
      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
      });

      expect(dispute).toBeTruthy();
      expect(dispute!.splitPercentage).toBeNull();
    });

    it('should have auditLogs relation', async () => {
      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: { auditLogs: true },
      });

      expect(dispute).toBeTruthy();
      expect(dispute!.auditLogs).toBeInstanceOf(Array);
      expect(dispute!.auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Dispute Resolution - Worker Wins', () => {
    it('should resolve dispute in favor of worker', async () => {
      const updatedDispute = await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: 'accept_pay',
          resolutionComment: 'Worker submission meets requirements despite minor issues',
          splitPercentage: null,
          resolverId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      expect(updatedDispute.status).toBe('resolved');
      expect(updatedDispute.resolutionType).toBe('accept_pay');
      expect(updatedDispute.splitPercentage).toBeNull();
      expect(updatedDispute.resolverId).toBe(adminUserId);
    });

    it('should create audit log for resolution', async () => {
      await prisma.disputeAuditLog.create({
        data: {
          disputeId,
          action: 'resolved',
          actorId: adminUserId,
          detailsJson: JSON.stringify({
            outcome: 'worker_wins',
            worker_amount: 50,
            requester_amount: 0,
          }),
        },
      });

      const auditLogs = await prisma.disputeAuditLog.findMany({
        where: { disputeId },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLogs.length).toBe(2);
      expect(auditLogs[0].action).toBe('resolved');
    });
  });

  describe('Dispute Resolution - Requester Wins', () => {
    it('should resolve dispute in favor of requester', async () => {
      const updatedDispute = await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: 'reject_refund',
          resolutionComment: 'Submission does not meet requirements',
          splitPercentage: null,
          resolverId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      expect(updatedDispute.status).toBe('resolved');
      expect(updatedDispute.resolutionType).toBe('reject_refund');
      expect(updatedDispute.splitPercentage).toBeNull();
    });
  });

  describe('Dispute Resolution - Split Payment', () => {
    it('should resolve dispute with 50/50 split', async () => {
      const updatedDispute = await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: 'partial_pay',
          resolutionComment: 'Partial completion warrants 50/50 split',
          splitPercentage: 50,
          resolverId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      expect(updatedDispute.status).toBe('resolved');
      expect(updatedDispute.resolutionType).toBe('partial_pay');
      expect(updatedDispute.splitPercentage).toBe(50);
    });

    it('should resolve dispute with 70/30 split (worker favored)', async () => {
      const updatedDispute = await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: 'partial_pay',
          resolutionComment: 'Mostly complete, minor issues',
          splitPercentage: 70,
          resolverId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      expect(updatedDispute.splitPercentage).toBe(70);
    });

    it('should resolve dispute with 30/70 split (requester favored)', async () => {
      const updatedDispute = await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: 'partial_pay',
          resolutionComment: 'Significant issues but some work completed',
          splitPercentage: 30,
          resolverId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      expect(updatedDispute.splitPercentage).toBe(30);
    });

    it('should handle edge case of 0% worker (same as requester wins)', async () => {
      const updatedDispute = await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: 'partial_pay',
          resolutionComment: 'No valid work submitted',
          splitPercentage: 0,
          resolverId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      expect(updatedDispute.splitPercentage).toBe(0);
    });

    it('should handle edge case of 100% worker (same as worker wins)', async () => {
      const updatedDispute = await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: 'partial_pay',
          resolutionComment: 'Full payment to worker',
          splitPercentage: 100,
          resolverId: adminUserId,
          resolvedAt: new Date(),
        },
      });

      expect(updatedDispute.splitPercentage).toBe(100);
    });
  });

  describe('DisputeAuditLog', () => {
    it('should create audit log entry', async () => {
      const log = await prisma.disputeAuditLog.create({
        data: {
          disputeId,
          action: 'status_changed',
          actorId: adminUserId,
          detailsJson: JSON.stringify({
            from_status: 'opened',
            to_status: 'under_review',
          }),
        },
      });

      expect(log.id).toBeTruthy();
      expect(log.disputeId).toBe(disputeId);
      expect(log.action).toBe('status_changed');
    });

    it('should query audit logs by dispute', async () => {
      // Add more log entries
      await prisma.disputeAuditLog.create({
        data: {
          disputeId,
          action: 'evidence_added',
          actorId: workerId,
          detailsJson: JSON.stringify({ evidence_type: 'screenshot' }),
        },
      });

      const logs = await prisma.disputeAuditLog.findMany({
        where: { disputeId },
        orderBy: { createdAt: 'asc' },
      });

      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it('should parse details JSON correctly', async () => {
      const log = await prisma.disputeAuditLog.findFirst({
        where: { disputeId, action: 'created' },
      });

      expect(log).toBeTruthy();
      const details = JSON.parse(typeof log!.detailsJson === 'string' ? log!.detailsJson : JSON.stringify(log!.detailsJson || {}));
      expect(details.reason).toBe('Location mismatch detected');
    });
  });

  describe('Escrow Split Calculation', () => {
    it('should calculate correct amounts for 50/50 split', () => {
      const amount = 50;
      const workerPercentage = 50;

      const workerAmount = Math.floor((amount * workerPercentage) / 100 * 100) / 100;
      const requesterAmount = Math.round((amount - workerAmount) * 100) / 100;

      expect(workerAmount).toBe(25);
      expect(requesterAmount).toBe(25);
      expect(workerAmount + requesterAmount).toBe(amount);
    });

    it('should calculate correct amounts for 70/30 split', () => {
      const amount = 50;
      const workerPercentage = 70;

      const workerAmount = Math.floor((amount * workerPercentage) / 100 * 100) / 100;
      const requesterAmount = Math.round((amount - workerAmount) * 100) / 100;

      expect(workerAmount).toBe(35);
      expect(requesterAmount).toBe(15);
      expect(workerAmount + requesterAmount).toBe(amount);
    });

    it('should handle decimal bounty amounts', () => {
      const amount = 99.99;
      const workerPercentage = 65;

      const workerAmount = Math.floor((amount * workerPercentage) / 100 * 100) / 100;
      const requesterAmount = Math.round((amount - workerAmount) * 100) / 100;

      expect(workerAmount).toBeCloseTo(64.99, 2);
      expect(requesterAmount).toBeCloseTo(35, 2);
      expect(Math.abs((workerAmount + requesterAmount) - amount)).toBeLessThan(0.01);
    });

    it('should handle small amounts without losing cents', () => {
      const amount = 1.00;
      const workerPercentage = 33;

      const workerAmount = Math.floor((amount * workerPercentage) / 100 * 100) / 100;
      const requesterAmount = Math.round((amount - workerAmount) * 100) / 100;

      expect(workerAmount).toBe(0.33);
      expect(requesterAmount).toBe(0.67);
      expect(workerAmount + requesterAmount).toBe(amount);
    });
  });

  describe('Dispute Queries', () => {
    it('should filter disputes by status', async () => {
      const openedDisputes = await prisma.dispute.findMany({
        where: { status: 'opened' },
      });

      expect(openedDisputes.length).toBeGreaterThanOrEqual(1);
      openedDisputes.forEach((d) => {
        expect(d.status).toBe('opened');
      });
    });

    it('should include submission and task details', async () => {
      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: {
          submission: {
            include: {
              task: true,
              worker: true,
              artefacts: true,
            },
          },
        },
      });

      expect(dispute).toBeTruthy();
      expect(dispute!.submission).toBeTruthy();
      expect(dispute!.submission.task).toBeTruthy();
      expect(dispute!.submission.task.title).toBe('Test Task for Dispute');
      expect(dispute!.submission.worker).toBeTruthy();
      expect(dispute!.submission.artefacts.length).toBeGreaterThan(0);
    });

    it('should order disputes by opened date', async () => {
      const disputes = await prisma.dispute.findMany({
        orderBy: { openedAt: 'desc' },
        take: 10,
      });

      for (let i = 1; i < disputes.length; i++) {
        expect(disputes[i - 1].openedAt.getTime()).toBeGreaterThanOrEqual(
          disputes[i].openedAt.getTime()
        );
      }
    });
  });
});
