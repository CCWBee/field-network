import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { recalculateUserStats } from '../services/reputation';
import { authenticate, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError, StateTransitionError } from '../middleware/errorHandler';
import { notifyTaskClaimed } from '../services/notifications';
import { dispatchWebhookEvent } from '../jobs/webhook-delivery';
import { createTaskStake, calculateStakeForTask, releaseTaskStake, getTaskStake } from '../services/staking';

// Helper to safely extract string from query param
function qs(param: any): string | undefined {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && typeof param[0] === 'string') return param[0];
  return undefined;
}

const router = Router();

const CLAIM_TTL_HOURS = 4; // Claims expire after 4 hours

async function expireClaimsForUser(userId: string) {
  const now = new Date();
  const expiredClaims = await prisma.taskClaim.findMany({
    where: {
      workerId: userId,
      status: 'active',
      claimedUntil: { lt: now },
    },
    include: { task: true },
  });

  if (expiredClaims.length === 0) {
    return;
  }

  for (const claim of expiredClaims) {
    await prisma.$transaction(async (tx) => {
      await tx.taskClaim.update({
        where: { id: claim.id },
        data: { status: 'expired' },
      });

      if (claim.task.status === 'claimed') {
        await tx.task.update({
          where: { id: claim.taskId },
          data: { status: 'posted' },
        });
      }

      await tx.workerProfile.updateMany({
        where: { userId },
        data: { strikes: { increment: 1 } },
      });

      await tx.auditEvent.create({
        data: {
          actorId: userId,
          action: 'claim.expired',
          objectType: 'claim',
          objectId: claim.id,
          detailsJson: JSON.stringify({ taskId: claim.taskId }),
        },
      });
    });
  }

  await recalculateUserStats(userId);
}

// GET /v1/tasks/:taskId/stake-info - Get required stake info before claiming
router.get('/:taskId/stake-info', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string;

    // Check task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, bountyAmount: true, currency: true, status: true },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    // Calculate required stake for this user
    const stakeInfo = await calculateStakeForTask(taskId as string, req.user!.userId);

    res.json({
      task_id: taskId,
      bounty_amount: task.bountyAmount,
      currency: task.currency,
      stake: {
        required_amount: stakeInfo.amount,
        percentage: stakeInfo.percentage,
        strike_count: stakeInfo.strikeCount,
        reputation_score: stakeInfo.reputationScore,
      },
      message: `You must stake ${stakeInfo.amount.toFixed(2)} ${task.currency} (${stakeInfo.percentage.toFixed(1)}% of bounty) to claim this task.`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/claims - List my active claims
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await expireClaimsForUser(req.user!.userId);

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

    // Fetch stake info for each claim
    const claimsWithStakes = await Promise.all(
      claims.map(async (claim) => {
        const stake = await getTaskStake(claim.taskId, req.user!.userId);
        return {
          id: claim.id,
          task_id: claim.taskId,
          task: claim.task,
          claimed_at: claim.claimedAt.toISOString(),
          claimed_until: claim.claimedUntil.toISOString(),
          status: claim.status,
          time_remaining_ms: Math.max(0, claim.claimedUntil.getTime() - Date.now()),
          stake: stake ? {
            amount: stake.amount,
            percentage: stake.stakePercentage,
            status: stake.status,
          } : null,
        };
      })
    );

    res.json({
      claims: claimsWithStakes,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/tasks/:taskId/claim - Claim a task
router.post('/:taskId/claim', authenticate, requireScope('claims:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string;

    await expireClaimsForUser(req.user!.userId);

    // Check task exists and is claimable
    const taskRaw = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        claims: {
          where: { status: 'active' },
        },
      },
    });

    if (!taskRaw) {
      throw new NotFoundError('Task');
    }

    const task = taskRaw as any;

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

    // Get worker's primary wallet for staking
    const workerWallet = await prisma.walletLink.findFirst({
      where: { userId: req.user!.userId, isPrimary: true },
    });

    // Calculate required stake
    const stakeInfo = await calculateStakeForTask(taskId as string, req.user!.userId);

    // Create stake (required before claim can proceed)
    const stakeResult = await createTaskStake(
      taskId as string,
      req.user!.userId,
      workerWallet?.walletAddress
    );

    if (!stakeResult.success) {
      throw new ValidationError(`Failed to create stake: ${stakeResult.error}`);
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
          taskId: taskId as string,
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

    await recalculateUserStats(req.user!.userId);

    // Notify the task requester that their task was claimed
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { username: true, ensName: true, email: true },
    });
    const workerName = user?.username || user?.ensName || user?.email?.split('@')[0] || 'A worker';
    await notifyTaskClaimed(task.requesterId, taskId, task.title, workerName);

    // Dispatch webhook event
    await dispatchWebhookEvent('task.claimed', {
      task_id: taskId,
      claim_id: claim.id,
      worker_id: req.user!.userId,
      worker_name: workerName,
      claimed_at: claim.claimedAt.toISOString(),
      claimed_until: claim.claimedUntil.toISOString(),
    }, task.requesterId);

    res.status(201).json({
      claim_id: claim.id,
      task_id: taskId,
      claimed_at: claim.claimedAt.toISOString(),
      claimed_until: claim.claimedUntil.toISOString(),
      time_remaining_ms: claimedUntil.getTime() - Date.now(),
      stake: {
        stake_id: stakeResult.stakeId,
        amount: stakeResult.amount,
        percentage: stakeInfo.percentage,
        strike_count: stakeInfo.strikeCount,
        reputation_score: stakeInfo.reputationScore,
        tx_hash: stakeResult.txHash,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/tasks/:taskId/unclaim - Release a claim
router.post('/:taskId/unclaim', authenticate, requireScope('claims:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string;

    const claim = await prisma.taskClaim.findFirst({
      where: {
        taskId: taskId as string,
        workerId: req.user!.userId,
        status: 'active',
      },
    });

    if (!claim) {
      throw new NotFoundError('Active claim');
    }

    // Release stake back to worker (voluntary unclaim returns stake)
    const stakeResult = await releaseTaskStake(taskId as string, req.user!.userId);
    if (!stakeResult.success) {
      console.error(`Failed to release stake for task ${taskId}: ${stakeResult.error}`);
      // Continue with unclaim even if stake release fails - can be retried
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
        detailsJson: JSON.stringify({ taskId, stake_released: stakeResult.success }),
      },
    });

    res.json({
      message: 'Claim released successfully',
      task_id: taskId,
      stake_released: stakeResult.success,
      stake_amount: stakeResult.amount,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
