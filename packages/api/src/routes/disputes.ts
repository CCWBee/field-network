import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database';
import { calculateArbitrationFee } from '../services/fees';
import { recalculateUserStats } from '../services/reputation';
import { authenticate, requireRole, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { notifyDisputeOpened, notifyDisputeResolved } from '../services/notifications';

const router = Router();

// GET /v1/disputes - List disputes (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = '20', offset = '0' } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const disputes = await prisma.dispute.findMany({
      where,
      include: {
        submission: {
          include: {
            task: true,
            worker: true,
            artefacts: true,
          },
        },
      },
      orderBy: { openedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.dispute.count({ where });

    res.json({
      disputes: disputes.map(d => ({
        id: d.id,
        submission_id: d.submissionId,
        opened_by: d.openedBy,
        status: d.status,
        resolution_type: d.resolutionType,
        resolution_comment: d.resolutionComment,
        resolver_id: d.resolverId,
        opened_at: d.openedAt.toISOString(),
        resolved_at: d.resolvedAt?.toISOString(),
        submission: {
          id: d.submission.id,
          task_id: d.submission.taskId,
          worker_id: d.submission.workerId,
          status: d.submission.status,
          task: {
            id: d.submission.task.id,
            title: d.submission.task.title,
            bounty_amount: d.submission.task.bountyAmount,
            currency: d.submission.task.currency,
          },
          worker_email: d.submission.worker.email,
          artefact_count: d.submission.artefacts.length,
        },
      })),
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/submissions/:submissionId/dispute - Open a dispute
router.post('/submissions/:submissionId/dispute', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { submissionId } = req.params;
    const { reason } = z.object({
      reason: z.string().min(10).max(1000).optional(),
    }).parse(req.body);

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!submission) {
      throw new NotFoundError('Submission');
    }

    // Only worker can dispute a rejected submission
    if (submission.workerId !== req.user!.userId) {
      throw new ForbiddenError('Only the submission worker can dispute');
    }

    if (submission.status !== 'rejected') {
      throw new ValidationError('Can only dispute rejected submissions');
    }

    // Check for existing open dispute
    const existingDispute = await prisma.dispute.findFirst({
      where: {
        submissionId,
        status: { not: 'resolved' },
      },
    });

    if (existingDispute) {
      throw new ValidationError('Dispute already exists for this submission');
    }

    const dispute = await prisma.dispute.create({
      data: {
        submissionId,
        openedBy: req.user!.userId,
        status: 'opened',
        resolutionComment: reason,
      },
    });

    // Update submission status
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'disputed' },
    });

    await recalculateUserStats(submission.workerId);

    // Notify both parties about the dispute
    await notifyDisputeOpened(
      submission.workerId,
      dispute.id,
      submission.task.title,
      false // Not the requester
    );
    await notifyDisputeOpened(
      submission.task.requesterId,
      dispute.id,
      submission.task.title,
      true // Is the requester
    );

    res.status(201).json({
      dispute_id: dispute.id,
      submission_id: submissionId,
      status: dispute.status,
      opened_at: dispute.openedAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/disputes/:disputeId - Get dispute details
router.get('/:disputeId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disputeId } = req.params;

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
            worker: true,
            artefacts: true,
            decisions: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundError('Dispute');
    }

    // Check access - admin, requester, or worker
    const isWorker = dispute.submission.workerId === req.user!.userId;
    const isRequester = dispute.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Dispute');
    }

    res.json({
      id: dispute.id,
      submission_id: dispute.submissionId,
      opened_by: dispute.openedBy,
      status: dispute.status,
      resolution_type: dispute.resolutionType,
      resolution_comment: dispute.resolutionComment,
      resolver_id: dispute.resolverId,
      opened_at: dispute.openedAt.toISOString(),
      resolved_at: dispute.resolvedAt?.toISOString(),
      submission: {
        id: dispute.submission.id,
        task_id: dispute.submission.taskId,
        worker_id: dispute.submission.workerId,
        status: dispute.submission.status,
        proof_bundle_hash: dispute.submission.proofBundleHash,
        verification_score: dispute.submission.verificationScore,
        task: {
          id: dispute.submission.task.id,
          title: dispute.submission.task.title,
          instructions: dispute.submission.task.instructions,
          bounty_amount: dispute.submission.task.bountyAmount,
          currency: dispute.submission.task.currency,
          requirements: JSON.parse(dispute.submission.task.requirementsJson),
        },
        artefacts: dispute.submission.artefacts.map(a => ({
          id: a.id,
          type: a.type,
          storage_key: a.storageKey,
          sha256: a.sha256,
        })),
        decisions: dispute.submission.decisions.map(d => ({
          id: d.id,
          type: d.decisionType,
          reason_code: d.reasonCode,
          comment: d.comment,
          created_at: d.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

const ResolveDisputeSchema = z.object({
  resolution_type: z.enum(['accept_pay', 'partial_pay', 'reject_refund', 'strike']),
  worker_payout_percent: z.number().min(0).max(100).optional(),
  comment: z.string().max(1000).optional(),
});

// POST /v1/disputes/:disputeId/resolve - Resolve a dispute (admin only)
router.post('/:disputeId/resolve', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disputeId } = req.params;
    const data = ResolveDisputeSchema.parse(req.body);

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
            worker: {
              include: {
                workerProfile: true,
              },
            },
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundError('Dispute');
    }

    if (dispute.status === 'resolved') {
      throw new ValidationError('Dispute already resolved');
    }

    // Determine new submission status based on resolution
    let submissionStatus: string;
    switch (data.resolution_type) {
      case 'accept_pay':
        submissionStatus = 'accepted';
        break;
      case 'partial_pay':
        submissionStatus = 'resolved';
        break;
      case 'reject_refund':
        submissionStatus = 'rejected';
        break;
      case 'strike':
        submissionStatus = 'rejected';
        // Apply strike to worker
        if (dispute.submission.worker.workerProfile) {
          await prisma.workerProfile.update({
            where: { userId: dispute.submission.workerId },
            data: { strikes: { increment: 1 } },
          });
        }
        break;
      default:
        submissionStatus = 'resolved';
    }

    // Update dispute
    const updatedDispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'resolved',
        resolutionType: data.resolution_type,
        resolutionComment: data.comment,
        resolverId: req.user!.userId,
        resolvedAt: new Date(),
      },
    });

    // Update submission
    await prisma.submission.update({
      where: { id: dispute.submissionId },
      data: { status: submissionStatus },
    });

    // Update task status if needed
    if (data.resolution_type === 'accept_pay') {
      await prisma.task.update({
        where: { id: dispute.submission.taskId },
        data: { status: 'accepted' },
      });
    }

    const { fee: arbitrationFee, rate: arbitrationRate } = calculateArbitrationFee(
      dispute.submission.task.bountyAmount
    );

    const feeMetadata = JSON.stringify({
      dispute_id: disputeId,
      fee_type: 'arbitration',
      fee_rate: arbitrationRate,
      resolution_type: data.resolution_type,
    });

    const feeEntries: any[] = [];
    if (data.resolution_type === 'accept_pay') {
      feeEntries.push({
        taskId: dispute.submission.taskId,
        submissionId: dispute.submissionId,
        entryType: 'fee',
        amount: arbitrationFee,
        currency: dispute.submission.task.currency,
        direction: 'debit',
        counterpartyId: dispute.submission.task.requesterId,
        metadata: feeMetadata,
      });
    } else if (data.resolution_type === 'reject_refund' || data.resolution_type === 'strike') {
      feeEntries.push({
        taskId: dispute.submission.taskId,
        submissionId: dispute.submissionId,
        entryType: 'fee',
        amount: arbitrationFee,
        currency: dispute.submission.task.currency,
        direction: 'debit',
        counterpartyId: dispute.submission.workerId,
        metadata: feeMetadata,
      });
    } else if (data.resolution_type === 'partial_pay') {
      const halfFee = arbitrationFee / 2;
      feeEntries.push(
        {
          taskId: dispute.submission.taskId,
          submissionId: dispute.submissionId,
          entryType: 'fee',
          amount: halfFee,
          currency: dispute.submission.task.currency,
          direction: 'debit',
          counterpartyId: dispute.submission.workerId,
          metadata: feeMetadata,
        },
        {
          taskId: dispute.submission.taskId,
          submissionId: dispute.submissionId,
          entryType: 'fee',
          amount: arbitrationFee - halfFee,
          currency: dispute.submission.task.currency,
          direction: 'debit',
          counterpartyId: dispute.submission.task.requesterId,
          metadata: feeMetadata,
        }
      );
    }

    if (feeEntries.length > 0) {
      await prisma.ledgerEntry.createMany({ data: feeEntries });
    }

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'dispute_resolved',
        objectType: 'dispute',
        objectId: disputeId,
        detailsJson: JSON.stringify({
          resolution_type: data.resolution_type,
          worker_payout_percent: data.worker_payout_percent,
        }),
      },
    });

    await Promise.all([
      recalculateUserStats(dispute.submission.workerId, {
        reason: 'dispute_resolved',
        taskId: dispute.submission.taskId,
        submissionId: dispute.submissionId,
      }),
      recalculateUserStats(dispute.submission.task.requesterId),
    ]);

    // Notify both parties about the resolution
    const taskTitle = dispute.submission.task.title;
    await notifyDisputeResolved(
      dispute.submission.workerId,
      disputeId,
      taskTitle,
      data.resolution_type,
      true // Is worker
    );
    await notifyDisputeResolved(
      dispute.submission.task.requesterId,
      disputeId,
      taskTitle,
      data.resolution_type,
      false // Is requester
    );

    res.json({
      dispute_id: updatedDispute.id,
      status: updatedDispute.status,
      resolution_type: updatedDispute.resolutionType,
      resolved_at: updatedDispute.resolvedAt?.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
