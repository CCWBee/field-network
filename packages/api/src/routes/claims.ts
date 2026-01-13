import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { authenticate, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError, StateTransitionError } from '../middleware/errorHandler';

const router = Router();

const CLAIM_TTL_HOURS = 4; // Claims expire after 4 hours

// GET /v1/claims - List my active claims
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claims = await prisma.taskClaim.findMany({
      where: {
        workerId: req.user!.userId,
        status: 'active',
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            timeStart: true,
            timeEnd: true,
            bountyAmount: true,
            currency: true,
            locationLat: true,
            locationLon: true,
            radiusM: true,
          },
        },
      },
      orderBy: { claimedAt: 'desc' },
    });

    res.json({
      claims: claims.map(claim => ({
        id: claim.id,
        task_id: claim.taskId,
        task: claim.task,
        claimed_at: claim.claimedAt.toISOString(),
        claimed_until: claim.claimedUntil.toISOString(),
        status: claim.status,
        time_remaining_ms: Math.max(0, claim.claimedUntil.getTime() - Date.now()),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/tasks/:taskId/claim - Claim a task
router.post('/:taskId/claim', authenticate, requireScope('claims:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;

    // Check task exists and is claimable
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        claims: {
          where: { status: 'active' },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    if (task.status !== 'posted') {
      throw new ValidationError(`Task is not available for claiming (status: ${task.status})`);
    }

    // Check if already claimed by someone else
    if (task.claims.length > 0) {
      throw new ValidationError('Task is already claimed');
    }

    // Check if worker has too many active claims
    const activeClaimsCount = await prisma.taskClaim.count({
      where: {
        workerId: req.user!.userId,
        status: 'active',
      },
    });

    if (activeClaimsCount >= 3) {
      throw new ValidationError('Maximum 3 active claims allowed');
    }

    // Check time window
    const now = new Date();
    if (now > task.timeEnd) {
      throw new ValidationError('Task time window has passed');
    }

    // Create claim
    const claimedUntil = new Date(Date.now() + CLAIM_TTL_HOURS * 60 * 60 * 1000);

    const claim = await prisma.$transaction(async (tx) => {
      // Update task status
      await tx.task.update({
        where: { id: taskId },
        data: { status: 'claimed' },
      });

      // Create claim record
      return tx.taskClaim.create({
        data: {
          taskId,
          workerId: req.user!.userId,
          claimedAt: now,
          claimedUntil,
          status: 'active',
        },
      });
    });

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'task.claimed',
        objectType: 'task',
        objectId: taskId,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ claimId: claim.id }),
      },
    });

    res.status(201).json({
      claim_id: claim.id,
      task_id: taskId,
      claimed_at: claim.claimedAt.toISOString(),
      claimed_until: claim.claimedUntil.toISOString(),
      time_remaining_ms: claimedUntil.getTime() - Date.now(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/tasks/:taskId/unclaim - Release a claim
router.post('/:taskId/unclaim', authenticate, requireScope('claims:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;

    const claim = await prisma.taskClaim.findFirst({
      where: {
        taskId,
        workerId: req.user!.userId,
        status: 'active',
      },
    });

    if (!claim) {
      throw new NotFoundError('Active claim');
    }

    await prisma.$transaction(async (tx) => {
      // Update claim status
      await tx.taskClaim.update({
        where: { id: claim.id },
        data: { status: 'released' },
      });

      // Update task back to posted
      await tx.task.update({
        where: { id: taskId },
        data: { status: 'posted' },
      });
    });

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'claim.released',
        objectType: 'claim',
        objectId: claim.id,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ taskId }),
      },
    });

    res.json({
      message: 'Claim released successfully',
      task_id: taskId,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
