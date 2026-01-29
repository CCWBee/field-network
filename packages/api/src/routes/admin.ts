import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database';
import { authenticate, requireRole, adminAuthHardening, logAdminAction, getClientIp } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { splitEscrow, refundEscrow, releaseEscrow } from '../services/escrow';
import { recalculateUserStats } from '../services/reputation';
import { deleteArtefacts } from '../services/storage';

// Helper to safely extract string from query param
function qs(param: any): string | undefined {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && typeof param[0] === 'string') return param[0];
  return undefined;
}

const router = Router();

// Apply admin hardening to all routes in this router
router.use(authenticate, adminAuthHardening);

// GET /v1/admin/stats - Admin overview stats
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      openDisputes,
      totalTasks,
      activeClaims,
      activeWorkers,
      pendingSubmissions,
      totalUsers,
    ] = await Promise.all([
      prisma.dispute.count({ where: { status: { not: 'resolved' } } }),
      prisma.task.count(),
      prisma.taskClaim.count({ where: { status: 'active' } }),
      prisma.taskClaim.groupBy({
        by: ['workerId'],
        where: { status: 'active' },
      }),
      prisma.submission.count({ where: { status: 'finalised' } }),
      prisma.user.count(),
    ]);

    res.json({
      open_disputes: openDisputes,
      total_tasks: totalTasks,
      active_claims: activeClaims,
      active_workers: activeWorkers.length,
      pending_submissions: pendingSubmissions,
      total_users: totalUsers,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/admin/users - List users
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, role, query, limit = '25', offset = '0' } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (role) {
      where.role = role;
    }
    if (query) {
      where.OR = [
        { email: { contains: query as string } },
        { username: { contains: query as string } },
        { ensName: { contains: query as string } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      include: { stats: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string) || 25, 100),
      skip: parseInt(offset as string) || 0,
    });

    const total = await prisma.user.count({ where });

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        status: u.status,
        ens_name: u.ensName,
        created_at: u.createdAt.toISOString(),
        stats: u.stats ? {
          reliability_score: u.stats.reliabilityScore,
          dispute_rate: u.stats.disputeRate,
          tasks_completed: u.stats.tasksCompleted,
          tasks_accepted: u.stats.tasksAccepted,
          total_earned: u.stats.totalEarned,
        } : null,
      })),
      total,
      limit: parseInt(limit as string) || 25,
      offset: parseInt(offset as string) || 0,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /v1/admin/users/:userId/status - Update user status
router.patch('/users/:userId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId as string;
    const { status } = req.body as { status?: string };

    if (!status || !['active', 'suspended', 'banned'].includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'admin.user_status_updated',
        objectType: 'user',
        objectId: userId,
        detailsJson: JSON.stringify({ status }),
      },
    });

    res.json({ id: userId, status });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DISPUTE MANAGEMENT ENDPOINTS
// ============================================================================

// GET /v1/admin/disputes - List disputes with filtering and pagination
router.get('/disputes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = qs(req.query.status);
    const from = qs(req.query.from);
    const to = qs(req.query.to);
    const limit = qs(req.query.limit) || '20';
    const offset = qs(req.query.offset) || '0';
    const sort_by = qs(req.query.sort_by) || 'opened_at';
    const sort_order = qs(req.query.sort_order) || 'desc';

    const where: any = {};

    // Status filter
    if (status && status !== 'all') {
      where.status = status;
    }

    // Date range filter
    if (from || to) {
      where.openedAt = {};
      if (from) {
        where.openedAt.gte = new Date(from);
      }
      if (to) {
        where.openedAt.lte = new Date(to);
      }
    }

    // Validate sort field
    const allowedSortFields = ['opened_at', 'resolved_at', 'status'];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'opened_at';
    const sortFieldMap: Record<string, string> = {
      opened_at: 'openedAt',
      resolved_at: 'resolvedAt',
      status: 'status',
    };

    const disputes = await prisma.dispute.findMany({
      where,
      include: {
        submission: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                bountyAmount: true,
                currency: true,
                requesterId: true,
              },
            },
            worker: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
            artefacts: {
              select: {
                id: true,
                type: true,
                storageKey: true,
              },
            },
          },
        },
      },
      orderBy: {
        [sortFieldMap[sortField] || 'openedAt']: sort_order === 'asc' ? 'asc' : 'desc',
      },
      take: Math.min(parseInt(limit) || 20, 100),
      skip: parseInt(offset) || 0,
    });

    const total = await prisma.dispute.count({ where });

    // Get requester info for each dispute
    const disputesWithRequester = await Promise.all(
      (disputes as any[]).map(async (d: any) => {
        const requester = await prisma.user.findUnique({
          where: { id: d.submission.task.requesterId },
          select: { id: true, email: true, username: true },
        });

        return {
          id: d.id,
          submission_id: d.submissionId,
          opened_by: d.openedBy,
          status: d.status,
          resolution_type: d.resolutionType,
          resolution_comment: d.resolutionComment,
          split_percentage: d.splitPercentage,
          resolver_id: d.resolverId,
          opened_at: d.openedAt.toISOString(),
          resolved_at: d.resolvedAt?.toISOString() || null,
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
            worker: {
              id: d.submission.worker.id,
              email: d.submission.worker.email,
              username: d.submission.worker.username,
            },
            requester: requester ? {
              id: requester.id,
              email: requester.email,
              username: requester.username,
            } : null,
            artefact_count: d.submission.artefacts.length,
          },
        };
      })
    );

    res.json({
      disputes: disputesWithRequester,
      total,
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/admin/disputes/:disputeId - Get dispute details with full context
router.get('/disputes/:disputeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
            worker: {
              include: {
                stats: true,
                badges: true,
              },
            },
            artefacts: true,
            decisions: {
              include: {
                actor: {
                  select: { id: true, email: true, username: true },
                },
              },
            },
          },
        },
        evidence: {
          include: {
            submitter: {
              select: { id: true, email: true, username: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    // Cast to any to access included relations
    const dispute = disputeRaw as any;

    // Get requester info
    const requester = await prisma.user.findUnique({
      where: { id: dispute.submission.task.requesterId },
      include: {
        stats: true,
        badges: true,
      },
    });

    // Get audit log for this dispute
    const auditLog = await prisma.auditEvent.findMany({
      where: {
        objectType: 'dispute',
        objectId: disputeId as string,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get dispute audit log entries
    const disputeAuditLog = await prisma.disputeAuditLog.findMany({
      where: { disputeId: disputeId as string },
      orderBy: { createdAt: 'desc' },
    });

    // Get escrow info for the task
    const escrow = await prisma.escrow.findFirst({
      where: { taskId: dispute.submission.taskId },
      orderBy: { createdAt: 'desc' },
    });

    // Generate signed URLs for artefacts (if storage service supports it)
    const artefactsWithUrls = await Promise.all(
      dispute.submission.artefacts.map(async (a: any) => {
        // For now, return storage key - signed URL generation depends on storage provider
        return {
          id: a.id,
          type: a.type,
          storage_key: a.storageKey,
          sha256: a.sha256,
          size_bytes: a.sizeBytes,
          width_px: a.widthPx,
          height_px: a.heightPx,
          captured_at: a.capturedAt?.toISOString() || null,
          gps_lat: a.gpsLat,
          gps_lon: a.gpsLon,
          // In production, this would be a signed URL
          download_url: `/v1/uploads/${a.storageKey}`,
        };
      })
    );

    // Format evidence with party information
    const workerId = dispute.submission.workerId;
    const requesterId = dispute.submission.task.requesterId;
    const evidenceItems = dispute.evidence.map((e: any) => ({
      id: e.id,
      dispute_id: e.disputeId,
      submitted_by: e.submittedBy,
      submitter: {
        id: e.submitter.id,
        email: e.submitter.email,
        username: e.submitter.username,
      },
      party: e.submittedBy === workerId ? 'worker' : 'requester',
      type: e.type,
      description: e.description,
      storage_key: e.storageKey,
      mime_type: e.mimeType,
      size_bytes: e.sizeBytes,
      sha256: e.sha256,
      download_url: e.storageKey ? `/v1/disputes/${disputeId}/evidence/${e.id}/download` : null,
      created_at: e.createdAt.toISOString(),
    }));

    // Count evidence by party
    const workerEvidenceCount = dispute.evidence.filter((e: any) => e.submittedBy === workerId).length;
    const requesterEvidenceCount = dispute.evidence.filter((e: any) => e.submittedBy === requesterId).length;

    // Check if evidence deadline has passed
    const evidenceDeadlinePassed = dispute.evidenceDeadline
      ? new Date() > dispute.evidenceDeadline
      : new Date() > new Date(dispute.openedAt.getTime() + 48 * 60 * 60 * 1000);

    res.json({
      id: dispute.id,
      submission_id: dispute.submissionId,
      opened_by: dispute.openedBy,
      status: dispute.status,
      resolution_type: dispute.resolutionType,
      resolution_comment: dispute.resolutionComment,
      split_percentage: dispute.splitPercentage,
      resolver_id: dispute.resolverId,
      opened_at: dispute.openedAt.toISOString(),
      resolved_at: dispute.resolvedAt?.toISOString() || null,
      evidence_deadline: dispute.evidenceDeadline?.toISOString() || null,
      evidence_deadline_passed: evidenceDeadlinePassed,
      evidence: evidenceItems,
      evidence_count: {
        total: dispute.evidence.length,
        worker: workerEvidenceCount,
        requester: requesterEvidenceCount,
      },
      submission: {
        id: dispute.submission.id,
        task_id: dispute.submission.taskId,
        status: dispute.submission.status,
        proof_bundle_hash: dispute.submission.proofBundleHash,
        verification_score: dispute.submission.verificationScore,
        flags: JSON.parse(dispute.submission.flagsJson || '[]'),
        created_at: dispute.submission.createdAt.toISOString(),
        finalised_at: dispute.submission.finalisedAt?.toISOString() || null,
        task: {
          id: dispute.submission.task.id,
          title: dispute.submission.task.title,
          instructions: dispute.submission.task.instructions,
          bounty_amount: dispute.submission.task.bountyAmount,
          currency: dispute.submission.task.currency,
          requirements: JSON.parse(dispute.submission.task.requirementsJson || '{}'),
          location: {
            lat: dispute.submission.task.locationLat,
            lon: dispute.submission.task.locationLon,
            radius_m: dispute.submission.task.radiusM,
          },
          time_window: {
            start: dispute.submission.task.timeStart.toISOString(),
            end: dispute.submission.task.timeEnd.toISOString(),
          },
        },
        artefacts: artefactsWithUrls,
        decisions: dispute.submission.decisions.map((d: any) => ({
          id: d.id,
          type: d.decisionType,
          reason_code: d.reasonCode,
          comment: d.comment,
          created_at: d.createdAt.toISOString(),
          actor: d.actor ? {
            id: d.actor.id,
            email: d.actor.email,
            username: d.actor.username,
          } : null,
        })),
      },
      worker: {
        id: dispute.submission.worker.id,
        email: dispute.submission.worker.email,
        username: dispute.submission.worker.username,
        stats: dispute.submission.worker.stats ? {
          reliability_score: dispute.submission.worker.stats.reliabilityScore,
          dispute_rate: dispute.submission.worker.stats.disputeRate,
          tasks_completed: dispute.submission.worker.stats.tasksCompleted,
          tasks_accepted: dispute.submission.worker.stats.tasksAccepted,
          total_earned: dispute.submission.worker.stats.totalEarned,
          current_streak: dispute.submission.worker.stats.currentStreak,
        } : null,
        badges: dispute.submission.worker.badges.map((b: any) => ({
          type: b.badgeType,
          tier: b.tier,
          title: b.title,
        })),
      },
      requester: requester ? {
        id: requester.id,
        email: requester.email,
        username: requester.username,
        stats: (requester as any).stats ? {
          reliability_score: (requester as any).stats.reliabilityScore,
          dispute_rate: (requester as any).stats.disputeRate,
          tasks_posted: (requester as any).stats.tasksPosted,
          tasks_completed: (requester as any).stats.tasksCompleted,
          total_bounties_paid: (requester as any).stats.totalBountiesPaid,
        } : null,
        badges: (requester as any).badges.map((b: any) => ({
          type: b.badgeType,
          tier: b.tier,
          title: b.title,
        })),
      } : null,
      escrow: escrow ? {
        id: escrow.id,
        status: escrow.status,
        amount: escrow.amount,
        currency: escrow.currency,
        funded_at: escrow.fundedAt?.toISOString() || null,
      } : null,
      audit_log: auditLog.map((e) => ({
        id: e.id,
        action: e.action,
        actor_id: e.actorId,
        ip: e.ip,
        created_at: e.createdAt.toISOString(),
        details: JSON.parse(typeof e.detailsJson === 'string' ? e.detailsJson : JSON.stringify(e.detailsJson || {})),
      })),
      dispute_audit_log: disputeAuditLog.map((e) => ({
        id: e.id,
        action: e.action,
        actor_id: e.actorId,
        created_at: e.createdAt.toISOString(),
        details: JSON.parse(typeof e.detailsJson === 'string' ? e.detailsJson : JSON.stringify(e.detailsJson || {})),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Resolve dispute schema
const ResolveDisputeSchema = z.object({
  outcome: z.enum(['worker_wins', 'requester_wins', 'split']),
  split_percentage: z.number().min(0).max(100).optional(),
  reason: z.string().min(20).max(2000),
});

// POST /v1/admin/disputes/:disputeId/resolve - Resolve a dispute
router.post('/disputes/:disputeId/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;
    const data = ResolveDisputeSchema.parse(req.body);

    // Validate split percentage is only provided for 'split' outcome
    if (data.outcome === 'split' && (data.split_percentage === undefined || data.split_percentage === null)) {
      throw new ValidationError('split_percentage is required when outcome is "split"');
    }
    if (data.outcome !== 'split' && data.split_percentage !== undefined) {
      throw new ValidationError('split_percentage should only be provided when outcome is "split"');
    }

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
            worker: {
              include: {
                walletLinks: { where: { isPrimary: true } },
              },
            },
            artefacts: true,
          },
        },
      },
    });

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    const dispute = disputeRaw as any;

    if (dispute.status === 'resolved') {
      throw new ValidationError('Dispute already resolved');
    }

    // Map outcome to resolution type
    const resolutionTypeMap: Record<string, string> = {
      worker_wins: 'accept_pay',
      requester_wins: 'reject_refund',
      split: 'partial_pay',
    };

    // Calculate escrow split amounts
    const bountyAmount = dispute.submission.task.bountyAmount;
    let workerAmount = 0;
    let requesterAmount = 0;

    switch (data.outcome) {
      case 'worker_wins':
        workerAmount = bountyAmount;
        requesterAmount = 0;
        break;
      case 'requester_wins':
        workerAmount = 0;
        requesterAmount = bountyAmount;
        break;
      case 'split':
        const splitPct = data.split_percentage!;
        workerAmount = (bountyAmount * splitPct) / 100;
        requesterAmount = bountyAmount - workerAmount;
        break;
    }

    // Get worker wallet address if available
    const workerWalletAddress = dispute.submission.worker.walletLinks[0]?.walletAddress;

    // Execute escrow split/release/refund based on outcome
    let escrowResult;
    if (data.outcome === 'worker_wins') {
      escrowResult = await releaseEscrow(
        dispute.submission.taskId,
        dispute.submission.workerId,
        workerWalletAddress
      );
    } else if (data.outcome === 'requester_wins') {
      escrowResult = await refundEscrow(dispute.submission.taskId);
    } else {
      // Split payment
      escrowResult = await splitEscrow(
        dispute.submission.taskId,
        dispute.submission.workerId,
        workerWalletAddress,
        data.split_percentage!
      );
    }

    if (!escrowResult.success) {
      console.error(`Escrow operation failed for dispute ${disputeId}: ${escrowResult.error}`);
      // Continue with resolution even if escrow fails - can be retried
    }

    // Determine new submission status
    let submissionStatus: string;
    switch (data.outcome) {
      case 'worker_wins':
        submissionStatus = 'accepted';
        break;
      case 'requester_wins':
        submissionStatus = 'rejected';
        break;
      case 'split':
        submissionStatus = 'resolved';
        break;
    }

    // Update dispute and submission in transaction
    const updatedDispute = await prisma.$transaction(async (tx) => {
      // Update dispute
      const resolved = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolutionType: resolutionTypeMap[data.outcome],
          resolutionComment: data.reason,
          splitPercentage: data.outcome === 'split' ? data.split_percentage : null,
          resolverId: req.user!.userId,
          resolvedAt: new Date(),
        },
      });

      // Update submission
      await tx.submission.update({
        where: { id: dispute.submissionId },
        data: { status: submissionStatus },
      });

      // Update task status if worker wins
      if (data.outcome === 'worker_wins') {
        await tx.task.update({
          where: { id: dispute.submission.taskId },
          data: { status: 'accepted' },
        });
      }

      // Create dispute audit log entry
      await tx.disputeAuditLog.create({
        data: {
          disputeId,
          action: 'resolved',
          actorId: req.user!.userId,
          detailsJson: JSON.stringify({
            outcome: data.outcome,
            split_percentage: data.split_percentage,
            worker_amount: workerAmount,
            requester_amount: requesterAmount,
            escrow_success: escrowResult.success,
            escrow_tx_hash: escrowResult.txHash,
          }),
        },
      });

      // Create ledger entries for the split
      if (workerAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            taskId: dispute.submission.taskId,
            submissionId: dispute.submissionId,
            entryType: 'release',
            amount: workerAmount,
            currency: dispute.submission.task.currency,
            direction: 'debit',
            counterpartyId: dispute.submission.workerId,
            walletAddress: workerWalletAddress,
            metadata: JSON.stringify({
              dispute_id: disputeId,
              resolution: data.outcome,
              split_percentage: data.split_percentage,
            }),
          },
        });
      }

      if (requesterAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            taskId: dispute.submission.taskId,
            submissionId: dispute.submissionId,
            entryType: 'refund',
            amount: requesterAmount,
            currency: dispute.submission.task.currency,
            direction: 'debit',
            counterpartyId: dispute.submission.task.requesterId,
            metadata: JSON.stringify({
              dispute_id: disputeId,
              resolution: data.outcome,
              split_percentage: data.split_percentage,
            }),
          },
        });
      }

      return resolved;
    });

    // If requester wins, clean up artefacts
    if (data.outcome === 'requester_wins') {
      const artefactKeys = dispute.submission.artefacts.map((a) => a.storageKey);
      if (artefactKeys.length > 0) {
        deleteArtefacts(artefactKeys).catch((err) => {
          console.error(`Failed to delete artefacts for dispute ${disputeId}:`, err);
        });
      }
    }

    // Recalculate user stats
    await Promise.all([
      recalculateUserStats(dispute.submission.workerId),
      recalculateUserStats(dispute.submission.task.requesterId),
    ]);

    // Log admin action
    await logAdminAction(req, 'dispute_resolved', {
      dispute_id: disputeId,
      outcome: data.outcome,
      split_percentage: data.split_percentage,
      worker_amount: workerAmount,
      requester_amount: requesterAmount,
    });

    res.json({
      dispute_id: updatedDispute.id,
      status: updatedDispute.status,
      resolution_type: updatedDispute.resolutionType,
      split_percentage: updatedDispute.splitPercentage,
      resolved_at: updatedDispute.resolvedAt?.toISOString(),
      escrow: {
        success: escrowResult.success,
        tx_hash: escrowResult.txHash,
        error: escrowResult.error,
      },
      amounts: {
        worker: workerAmount,
        requester: requesterAmount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// TASK MODERATION ENDPOINTS
// ============================================================================

// GET /v1/admin/tasks - List all tasks for moderation
router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      status,
      flagged,
      limit = '25',
      offset = '0',
    } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        requester: {
          select: { id: true, email: true, username: true },
        },
        claims: {
          where: { status: 'active' },
          select: { id: true, workerId: true },
        },
        submissions: {
          select: { id: true, status: true },
        },
        escrows: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string) || 25, 100),
      skip: parseInt(offset as string) || 0,
    });

    const total = await prisma.task.count({ where });

    res.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        bounty_amount: t.bountyAmount,
        currency: t.currency,
        location: {
          lat: t.locationLat,
          lon: t.locationLon,
          radius_m: t.radiusM,
        },
        time_window: {
          start: t.timeStart.toISOString(),
          end: t.timeEnd.toISOString(),
        },
        created_at: t.createdAt.toISOString(),
        published_at: t.publishedAt?.toISOString() || null,
        requester: t.requester,
        active_claims: t.claims.length,
        submissions_count: t.submissions.length,
        escrow: t.escrows[0] ? {
          status: t.escrows[0].status,
          amount: t.escrows[0].amount,
        } : null,
      })),
      total,
      limit: parseInt(limit as string) || 25,
      offset: parseInt(offset as string) || 0,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/admin/tasks/:taskId/cancel - Admin cancel a task
router.post('/tasks/:taskId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string;
    const { reason } = req.body;

    const taskRaw = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        escrows: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!taskRaw) {
      throw new NotFoundError('Task');
    }

    const task = taskRaw as any;

    if (['cancelled', 'accepted'].includes(task.status)) {
      throw new ValidationError(`Cannot cancel task with status: ${task.status}`);
    }

    // Refund escrow if funded
    if (task.escrows[0]?.status === 'funded') {
      const refundResult = await refundEscrow(taskId as string);
      if (!refundResult.success) {
        console.error(`Escrow refund failed for task ${taskId}: ${refundResult.error}`);
      }
    }

    // Update task and release claims
    await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: { status: 'cancelled' },
      }),
      prisma.taskClaim.updateMany({
        where: { taskId: taskId as string, status: 'active' },
        data: { status: 'released' },
      }),
    ]);

    // Log action
    await logAdminAction(req, 'task_cancelled', {
      task_id: taskId,
      reason,
      previous_status: task.status,
    });

    res.json({
      task_id: taskId,
      status: 'cancelled',
      reason,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
