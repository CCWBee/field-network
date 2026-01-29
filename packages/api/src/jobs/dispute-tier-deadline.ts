import { Job } from 'bullmq';
import { prisma } from '../services/database';
import { QUEUE_NAMES, registerWorker, scheduleRepeatingJob } from '../lib/queue';
import {
  processTier1Result,
  checkJuryVotingComplete,
  resolveDispute,
} from '../services/disputes';

/**
 * Dispute Tier Deadline Job
 *
 * Runs every 5 minutes to:
 * 1. Process Tier 1 disputes after evidence deadline
 * 2. Finalize Tier 2 jury voting when deadline passes
 * 3. Auto-resolve Tier 3 appeals when deadline passes (uphold previous decision)
 *
 * This job ensures disputes progress through tiers even if parties
 * don't take action within the allotted time windows.
 */

interface DisputeTierDeadlineJobData {
  runAt: string;
  dryRun?: boolean;
}

interface DisputeTierDeadlineResult {
  tier1Processed: number;
  tier2Finalized: number;
  tier3Expired: number;
  errors: string[];
}

/**
 * Process disputes that have passed their tier deadlines
 */
async function processDisputeDeadlines(dryRun = false): Promise<DisputeTierDeadlineResult> {
  const now = new Date();
  const result: DisputeTierDeadlineResult = {
    tier1Processed: 0,
    tier2Finalized: 0,
    tier3Expired: 0,
    errors: [],
  };

  // 1. Find Tier 1 disputes where evidence deadline has passed and not yet processed
  // Using raw query since new fields may not be in generated Prisma client yet
  const tier1Disputes = await prisma.dispute.findMany({
    where: {
      status: { in: ['opened', 'evidence_pending', 'tier1_review'] },
      evidenceDeadline: { lt: now },
    },
  });

  // Filter to tier 1 disputes without auto score (field may not exist in type yet)
  const tier1ToProcess = tier1Disputes.filter((d: any) =>
    d.currentTier === 1 && d.autoScoreResult === null
  );

  console.log(`Found ${tier1ToProcess.length} Tier 1 disputes to process`);

  for (const dispute of tier1ToProcess) {
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would process Tier 1 dispute ${dispute.id}`);
        continue;
      }

      await processTier1Result(dispute.id);
      result.tier1Processed++;
      console.log(`Processed Tier 1 dispute ${dispute.id}`);
    } catch (error) {
      const errorMsg = `Failed to process Tier 1 dispute ${dispute.id}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }

  // 2. Find Tier 2 disputes where jury voting deadline has passed
  const allDisputes = await prisma.dispute.findMany({
    where: {
      status: 'tier2_voting',
    },
  });

  // Filter to tier 2 disputes past deadline
  const tier2Disputes = allDisputes.filter((d: any) =>
    d.currentTier === 2 && d.tier2Deadline && new Date(d.tier2Deadline) < now
  );

  console.log(`Found ${tier2Disputes.length} Tier 2 disputes to finalize`);

  for (const dispute of tier2Disputes) {
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would finalize Tier 2 voting for dispute ${dispute.id}`);
        continue;
      }

      await checkJuryVotingComplete(dispute.id);
      result.tier2Finalized++;
      console.log(`Finalized Tier 2 voting for dispute ${dispute.id}`);
    } catch (error) {
      const errorMsg = `Failed to finalize Tier 2 dispute ${dispute.id}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }

  // 3. Find Tier 3 appeals where deadline has passed without admin action
  const tier3AllDisputes = await prisma.dispute.findMany({
    where: {
      status: 'tier3_appeal',
    },
    include: {
      submission: {
        include: {
          task: true,
        },
      },
    },
  });

  // Filter to tier 3 disputes past deadline
  const tier3Disputes = tier3AllDisputes.filter((d: any) =>
    d.currentTier === 3 && d.tier3Deadline && new Date(d.tier3Deadline) < now
  );

  console.log(`Found ${tier3Disputes.length} Tier 3 appeals that have expired`);

  for (const dispute of tier3Disputes) {
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would expire Tier 3 appeal for dispute ${dispute.id}`);
        continue;
      }

      // Get the previous resolution from tier history
      const disputeAny = dispute as any;
      const tierHistory = (disputeAny.tierHistory as any[]) || [];
      const previousTier2 = tierHistory.find((t: any) => t.from === 2 && t.to === 3);

      // Default to upholding the previous decision (appellant loses)
      // This means appellant's stake is forfeited
      const previousOutcome = previousTier2?.details?.previousOutcome || 'worker_wins';
      const outcome = previousOutcome as 'worker_wins' | 'requester_wins';

      await resolveDispute(dispute.id, {
        outcome,
        reason: `Tier 3 Admin Appeal: Appeal deadline expired without admin action. Previous jury decision upheld by default. Appeal stake forfeited.`,
        tier: 3,
        appealReversed: false,
        escalationStake: disputeAny.escalationStake,
      });

      result.tier3Expired++;
      console.log(`Expired Tier 3 appeal for dispute ${dispute.id} - previous decision upheld`);
    } catch (error) {
      const errorMsg = `Failed to expire Tier 3 dispute ${dispute.id}: ${
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
async function processDisputeTierDeadlineJob(job: Job<DisputeTierDeadlineJobData>): Promise<DisputeTierDeadlineResult> {
  console.log(`Processing dispute tier deadline job ${job.id} at ${new Date().toISOString()}`);

  const result = await processDisputeDeadlines(job.data.dryRun);

  console.log(
    `Dispute tier deadline job completed: ${result.tier1Processed} Tier 1, ${result.tier2Finalized} Tier 2, ${result.tier3Expired} Tier 3, ${result.errors.length} errors`
  );

  return result;
}

/**
 * Register the dispute tier deadline worker
 */
export function registerDisputeTierDeadlineWorker(): void {
  registerWorker<DisputeTierDeadlineJobData>(QUEUE_NAMES.DISPUTE_DEADLINE, processDisputeTierDeadlineJob, {
    concurrency: 1, // Run one at a time to prevent race conditions
    limiter: {
      max: 1,
      duration: 60000, // At most 1 job per minute
    },
  });

  console.log('Dispute tier deadline worker registered');
}

/**
 * Schedule the repeating dispute tier deadline job
 * Runs every 5 minutes
 */
export async function scheduleDisputeTierDeadlineJob(): Promise<void> {
  await scheduleRepeatingJob(
    QUEUE_NAMES.DISPUTE_DEADLINE,
    'process-dispute-tier-deadlines',
    { runAt: new Date().toISOString() },
    { every: 5 * 60 * 1000 } // Every 5 minutes
  );

  console.log('Dispute tier deadline job scheduled (every 5 minutes)');
}

/**
 * Run dispute tier deadline processing manually (for testing or manual intervention)
 */
export async function runDisputeTierDeadlineNow(dryRun = false): Promise<DisputeTierDeadlineResult> {
  console.log(`Running dispute tier deadline processing manually (dryRun=${dryRun})`);
  return processDisputeDeadlines(dryRun);
}
