import { prisma } from './database';

/**
 * Background job service for handling task and claim expiration
 */

// Run interval in milliseconds (every 5 minutes)
const EXPIRY_CHECK_INTERVAL = 5 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

export async function checkExpiredClaims(): Promise<number> {
  const now = new Date();

  // Find active claims that have expired
  const expiredClaims = await prisma.taskClaim.findMany({
    where: {
      status: 'active',
      claimedUntil: { lt: now },
    },
    include: { task: true },
  });

  let count = 0;
  for (const claim of expiredClaims) {
    try {
      await prisma.$transaction([
        // Mark claim as expired
        prisma.taskClaim.update({
          where: { id: claim.id },
          data: { status: 'expired' },
        }),
        // If task is still in claimed status, set back to posted
        ...(claim.task.status === 'claimed'
          ? [
              prisma.task.update({
                where: { id: claim.taskId },
                data: { status: 'posted' },
              }),
            ]
          : []),
        // Create audit event
        prisma.auditEvent.create({
          data: {
            action: 'claim_expired',
            objectType: 'task_claim',
            objectId: claim.id,
            detailsJson: JSON.stringify({
              task_id: claim.taskId,
              worker_id: claim.workerId,
              claimed_until: claim.claimedUntil.toISOString(),
            }),
          },
        }),
      ]);
      count++;
      console.log(`[ExpiryJobs] Expired claim ${claim.id} for task ${claim.taskId}`);
    } catch (error) {
      console.error(`[ExpiryJobs] Error expiring claim ${claim.id}:`, error);
    }
  }

  return count;
}

export async function checkExpiredTasks(): Promise<number> {
  const now = new Date();

  // Find tasks that have passed their end time
  const expiredTasks = await prisma.task.findMany({
    where: {
      status: { in: ['posted', 'claimed'] },
      timeEnd: { lt: now },
    },
  });

  let count = 0;
  for (const task of expiredTasks) {
    try {
      await prisma.$transaction([
        // Mark task as expired
        prisma.task.update({
          where: { id: task.id },
          data: { status: 'expired' },
        }),
        // Expire all active claims for this task
        prisma.taskClaim.updateMany({
          where: { taskId: task.id, status: 'active' },
          data: { status: 'expired' },
        }),
        // Create audit event
        prisma.auditEvent.create({
          data: {
            action: 'task_expired',
            objectType: 'task',
            objectId: task.id,
            detailsJson: JSON.stringify({
              time_end: task.timeEnd.toISOString(),
            }),
          },
        }),
      ]);
      count++;
      console.log(`[ExpiryJobs] Expired task ${task.id}`);
    } catch (error) {
      console.error(`[ExpiryJobs] Error expiring task ${task.id}:`, error);
    }
  }

  return count;
}

export async function checkAutoReleaseEscrows(): Promise<number> {
  const now = new Date();

  // Find escrows that are accepted and past their auto-release time
  const escrowsToRelease = await prisma.escrow.findMany({
    where: {
      status: 'funded',
      autoReleaseAt: { lt: now },
    },
    include: { task: true },
  });

  let count = 0;
  for (const escrow of escrowsToRelease) {
    try {
      // In a real implementation, this would trigger the on-chain release
      // For now, we just log it
      console.log(`[ExpiryJobs] Escrow ${escrow.id} ready for auto-release`);
      count++;
    } catch (error) {
      console.error(`[ExpiryJobs] Error processing escrow ${escrow.id}:`, error);
    }
  }

  return count;
}

async function runExpiryChecks(): Promise<void> {
  console.log('[ExpiryJobs] Running expiry checks...');

  try {
    const expiredClaims = await checkExpiredClaims();
    const expiredTasks = await checkExpiredTasks();
    const autoReleases = await checkAutoReleaseEscrows();

    console.log(
      `[ExpiryJobs] Completed: ${expiredClaims} claims, ${expiredTasks} tasks, ${autoReleases} escrows`
    );
  } catch (error) {
    console.error('[ExpiryJobs] Error in expiry checks:', error);
  }
}

export function startExpiryJobs(): void {
  if (intervalId) {
    console.log('[ExpiryJobs] Already running');
    return;
  }

  console.log(`[ExpiryJobs] Starting (interval: ${EXPIRY_CHECK_INTERVAL}ms)`);

  // Run immediately on start
  runExpiryChecks();

  // Schedule periodic runs
  intervalId = setInterval(runExpiryChecks, EXPIRY_CHECK_INTERVAL);
}

export function stopExpiryJobs(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[ExpiryJobs] Stopped');
  }
}
