import { Job } from 'bullmq';
import { prisma } from '../services/database';
import { QUEUE_NAMES, registerWorker, scheduleRepeatingJob } from '../lib/queue';

/**
 * Claim Expiry Job
 *
 * Runs every 5 minutes to:
 * 1. Find active claims past their expiry time
 * 2. Mark them as 'expired'
 * 3. Update task status back to 'posted' (make it available again)
 * 4. Reduce worker reliability score by 5 points per abandonment
 * 5. Reset worker's streak counter
 *
 * This job ensures that tasks are not indefinitely locked by workers
 * who abandon claims without submitting.
 */

interface ClaimExpiryJobData {
  runAt: string;
  dryRun?: boolean;
}

interface ClaimExpiryResult {
  processedCount: number;
  expiredClaims: string[];
  errors: string[];
}

/**
 * Process expired claims
 */
async function processExpiredClaims(dryRun = false): Promise<ClaimExpiryResult> {
  const now = new Date();
  const result: ClaimExpiryResult = {
    processedCount: 0,
    expiredClaims: [],
    errors: [],
  };

  // Find all active claims that have passed their expiry time
  const expiredClaims = await prisma.taskClaim.findMany({
    where: {
      status: 'active',
      claimedUntil: {
        lt: now,
      },
    },
    include: {
      task: true,
      worker: {
        include: {
          stats: true,
        },
      },
    },
  });

  console.log(`Found ${expiredClaims.length} expired claims to process`);

  for (const claim of expiredClaims) {
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would expire claim ${claim.id} for task ${claim.taskId}`);
        result.expiredClaims.push(claim.id);
        continue;
      }

      // Use a transaction to ensure consistency
      await prisma.$transaction(async (tx) => {
        // 1. Mark claim as expired
        await tx.taskClaim.update({
          where: { id: claim.id },
          data: { status: 'expired' },
        });

        // 2. Update task status back to 'posted' if it was claimed
        if (claim.task.status === 'claimed') {
          await tx.task.update({
            where: { id: claim.taskId },
            data: { status: 'posted' },
          });
        }

        // 3. Update worker stats if they exist
        if (claim.worker.stats) {
          const currentReliability = claim.worker.stats.reliabilityScore;
          const newReliability = Math.max(0, currentReliability - 5); // Reduce by 5, min 0

          await tx.userStats.update({
            where: { userId: claim.workerId },
            data: {
              reliabilityScore: newReliability,
              currentStreak: 0, // Reset streak on abandonment
              lastCalculatedAt: now,
            },
          });

          // 4. Create reputation event for tracking
          await tx.reputationEvent.create({
            data: {
              userId: claim.workerId,
              previousScore: currentReliability,
              newScore: newReliability,
              reason: 'claim_abandoned',
              taskId: claim.taskId,
              metadata: {
                claimId: claim.id,
                claimedAt: claim.claimedAt.toISOString(),
                expiredAt: now.toISOString(),
                taskTitle: claim.task.title,
              },
            },
          });

          // 5. Create notification for the worker
          await tx.notification.create({
            data: {
              userId: claim.workerId,
              type: 'claim_expired',
              title: 'Task Claim Expired',
              body: `Your claim on "${claim.task.title}" has expired. Your reliability score has been reduced.`,
              data: {
                taskId: claim.taskId,
                claimId: claim.id,
                reliabilityChange: -5,
              },
            },
          });
        }

        // 6. Create audit event
        await tx.auditEvent.create({
          data: {
            actorId: null, // System action
            action: 'claim_expired',
            objectType: 'TaskClaim',
            objectId: claim.id,
            detailsJson: {
              taskId: claim.taskId,
              workerId: claim.workerId,
              claimedAt: claim.claimedAt.toISOString(),
              claimedUntil: claim.claimedUntil.toISOString(),
              expiredAt: now.toISOString(),
            },
          },
        });
      });

      result.expiredClaims.push(claim.id);
      result.processedCount++;

      console.log(`Expired claim ${claim.id} for task "${claim.task.title}"`);
    } catch (error) {
      const errorMsg = `Failed to process claim ${claim.id}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }

  return result;
}

/**
 * Job processor function
 */
async function processClaimExpiryJob(job: Job<ClaimExpiryJobData>): Promise<ClaimExpiryResult> {
  console.log(`Processing claim expiry job ${job.id} at ${new Date().toISOString()}`);

  const result = await processExpiredClaims(job.data.dryRun);

  console.log(
    `Claim expiry job completed: ${result.processedCount} claims expired, ${result.errors.length} errors`
  );

  return result;
}

/**
 * Register the claim expiry worker
 */
export function registerClaimExpiryWorker(): void {
  registerWorker<ClaimExpiryJobData>(QUEUE_NAMES.CLAIM_EXPIRY, processClaimExpiryJob, {
    concurrency: 1, // Run one at a time to prevent race conditions
    limiter: {
      max: 1,
      duration: 60000, // At most 1 job per minute
    },
  });

  console.log('Claim expiry worker registered');
}

/**
 * Schedule the repeating claim expiry job
 * Runs every 5 minutes
 */
export async function scheduleClaimExpiryJob(): Promise<void> {
  await scheduleRepeatingJob(
    QUEUE_NAMES.CLAIM_EXPIRY,
    'process-expired-claims',
    { runAt: new Date().toISOString() },
    { every: 5 * 60 * 1000 } // Every 5 minutes
  );

  console.log('Claim expiry job scheduled (every 5 minutes)');
}

/**
 * Run claim expiry manually (for testing or manual intervention)
 */
export async function runClaimExpiryNow(dryRun = false): Promise<ClaimExpiryResult> {
  console.log(`Running claim expiry manually (dryRun=${dryRun})`);
  return processExpiredClaims(dryRun);
}
