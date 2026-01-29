import { prisma } from './database';
import { notifyDisputeEscalated, notifyJuryDuty, notifyDisputeResolved } from './notifications';
import { recalculateUserStats } from './reputation';

/**
 * Multi-Tier Dispute Resolution System
 *
 * Tier 1: Automated Scoring (instant)
 * - Run verification checks (GPS, time, image quality)
 * - If score > 80%: auto-resolve in worker's favor
 * - If score < 20%: auto-resolve in requester's favor
 * - Otherwise: escalate to Tier 2
 *
 * Tier 2: Community Jury (48hr window)
 * - Select 5 random jurors with >90 reliability score
 * - Jurors review evidence and vote
 * - Majority wins (3/5)
 * - Stake-weighted voting optional
 *
 * Tier 3: Admin Appeal (72hr window)
 * - Loser can appeal with additional stake (10% of bounty)
 * - Admin makes final decision
 * - If appeal successful: extra stake returned + resolution reversed
 * - If appeal fails: extra stake forfeited
 */

// Tier 1 threshold constants
const AUTO_RESOLVE_WORKER_THRESHOLD = 80; // Score >= 80% = worker wins
const AUTO_RESOLVE_REQUESTER_THRESHOLD = 20; // Score <= 20% = requester wins
const JURY_SIZE = 5;
const JURY_MIN_RELIABILITY = 90;
const TIER2_DURATION_HOURS = 48;
const TIER3_DURATION_HOURS = 72;
const APPEAL_STAKE_PERCENTAGE = 0.10; // 10% of bounty

interface AutoScoreCheck {
  name: string;
  passed: boolean;
  score: number; // 0-100
  weight: number; // Weight for final score calculation
  details?: string;
}

interface AutoScoreResult {
  totalScore: number;
  checks: AutoScoreCheck[];
  recommendation: 'worker_wins' | 'requester_wins' | 'escalate';
  timestamp: string;
}

interface TierTransition {
  from: number;
  to: number;
  reason: string;
  actorId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Run Tier 1 automated scoring for a dispute
 */
export async function runTier1AutoScore(disputeId: string): Promise<AutoScoreResult> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      submission: {
        include: {
          task: true,
          artefacts: true,
        },
      },
    },
  });

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const { submission } = dispute;
  const { task, artefacts } = submission;
  const checks: AutoScoreCheck[] = [];

  // Check 1: Verification Score (existing system)
  checks.push({
    name: 'verification_score',
    passed: submission.verificationScore >= 70,
    score: submission.verificationScore,
    weight: 30,
    details: `Verification score: ${submission.verificationScore}%`,
  });

  // Check 2: Artefact Count
  const requiredArtefacts = (task.requirementsJson as any)?.minArtefacts || 1;
  const artefactCount = artefacts.length;
  const artefactScore = Math.min(100, (artefactCount / requiredArtefacts) * 100);
  checks.push({
    name: 'artefact_count',
    passed: artefactCount >= requiredArtefacts,
    score: artefactScore,
    weight: 15,
    details: `${artefactCount}/${requiredArtefacts} artefacts submitted`,
  });

  // Check 3: GPS Location (if any artefact has GPS)
  const artefactsWithGps = artefacts.filter(a => a.gpsLat !== null && a.gpsLon !== null);
  let locationScore = 0;
  if (artefactsWithGps.length > 0 && task.locationLat && task.locationLon) {
    // Calculate distance for each artefact and take best match
    const distances = artefactsWithGps.map(a => {
      return calculateHaversineDistance(
        task.locationLat,
        task.locationLon,
        a.gpsLat!,
        a.gpsLon!
      );
    });
    const minDistance = Math.min(...distances);
    const radiusM = task.radiusM;

    if (minDistance <= radiusM) {
      locationScore = 100;
    } else if (minDistance <= radiusM * 1.5) {
      locationScore = 70;
    } else if (minDistance <= radiusM * 2) {
      locationScore = 40;
    } else {
      locationScore = 0;
    }
  } else if (artefactsWithGps.length === 0) {
    // No GPS data - neutral (50)
    locationScore = 50;
  }
  checks.push({
    name: 'location_check',
    passed: locationScore >= 70,
    score: locationScore,
    weight: 25,
    details: artefactsWithGps.length > 0
      ? `GPS data within acceptable range`
      : `No GPS data available`,
  });

  // Check 4: Submission Timing
  const claimTime = submission.createdAt;
  const timeEnd = task.timeEnd;
  const timingScore = claimTime <= timeEnd ? 100 : 0;
  checks.push({
    name: 'timing_check',
    passed: timingScore === 100,
    score: timingScore,
    weight: 15,
    details: timingScore === 100 ? 'Submitted within time window' : 'Submitted after deadline',
  });

  // Check 5: Image Quality (if photos exist)
  const photoArtefacts = artefacts.filter(a => a.type === 'photo');
  let qualityScore = 50; // Default neutral
  if (photoArtefacts.length > 0) {
    const avgSize = photoArtefacts.reduce((sum, a) => sum + a.sizeBytes, 0) / photoArtefacts.length;
    const avgDimension = photoArtefacts.reduce((sum, a) => sum + Math.max(a.widthPx, a.heightPx), 0) / photoArtefacts.length;

    // Score based on image quality indicators
    if (avgSize > 500000 && avgDimension > 1000) {
      qualityScore = 100;
    } else if (avgSize > 200000 && avgDimension > 600) {
      qualityScore = 75;
    } else if (avgSize > 50000 && avgDimension > 300) {
      qualityScore = 50;
    } else {
      qualityScore = 25;
    }
  }
  checks.push({
    name: 'image_quality',
    passed: qualityScore >= 50,
    score: qualityScore,
    weight: 15,
    details: `Average image quality assessment: ${qualityScore}%`,
  });

  // Calculate weighted total score
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const totalScore = checks.reduce((sum, c) => sum + (c.score * c.weight), 0) / totalWeight;

  // Determine recommendation
  let recommendation: 'worker_wins' | 'requester_wins' | 'escalate';
  if (totalScore >= AUTO_RESOLVE_WORKER_THRESHOLD) {
    recommendation = 'worker_wins';
  } else if (totalScore <= AUTO_RESOLVE_REQUESTER_THRESHOLD) {
    recommendation = 'requester_wins';
  } else {
    recommendation = 'escalate';
  }

  const result: AutoScoreResult = {
    totalScore: Math.round(totalScore * 10) / 10,
    checks,
    recommendation,
    timestamp: new Date().toISOString(),
  };

  // Store result in dispute
  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      autoScoreResult: result as any,
      tier1Deadline: new Date(Date.now() + 5 * 60 * 1000), // 5 minute review window
    },
  });

  // Create audit log
  await prisma.disputeAuditLog.create({
    data: {
      disputeId,
      action: 'tier1_auto_score',
      detailsJson: result as any,
    },
  });

  return result;
}

/**
 * Process Tier 1 result and either auto-resolve or escalate
 */
export async function processTier1Result(disputeId: string): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      submission: {
        include: {
          task: true,
        },
      },
    },
  });

  const disputeAny = dispute as any;
  if (!dispute || disputeAny.currentTier !== 1) {
    return;
  }

  const autoResult = disputeAny.autoScoreResult as AutoScoreResult | null;
  if (!autoResult) {
    // Run auto-score if not yet done
    await runTier1AutoScore(disputeId);
    return;
  }

  const { recommendation } = autoResult;

  if (recommendation === 'worker_wins') {
    await resolveDispute(disputeId, {
      outcome: 'worker_wins',
      reason: `Tier 1 Auto-Resolution: Automated verification score of ${autoResult.totalScore}% indicates submission meets task requirements.`,
      tier: 1,
    });
  } else if (recommendation === 'requester_wins') {
    await resolveDispute(disputeId, {
      outcome: 'requester_wins',
      reason: `Tier 1 Auto-Resolution: Automated verification score of ${autoResult.totalScore}% indicates submission does not meet task requirements.`,
      tier: 1,
    });
  } else {
    // Escalate to Tier 2
    await escalateToTier2(disputeId, 'Automated scoring inconclusive');
  }
}

/**
 * Escalate dispute to Tier 2 (Community Jury)
 */
export async function escalateToTier2(disputeId: string, reason: string): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      submission: {
        include: {
          task: true,
          worker: true,
        },
      },
    },
  });

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const now = new Date();
  const tier2Deadline = new Date(now.getTime() + TIER2_DURATION_HOURS * 60 * 60 * 1000);

  // Get current tier history
  const disputeAny = dispute as any;
  const currentHistory = (disputeAny.tierHistory as TierTransition[]) || [];
  const newTransition: TierTransition = {
    from: disputeAny.currentTier,
    to: 2,
    reason,
    timestamp: now.toISOString(),
  };

  // Select jury members
  const jurors = await selectJuryMembers(
    disputeId,
    dispute.submission.workerId,
    dispute.submission.task.requesterId
  );

  await prisma.$transaction(async (tx) => {
    // Update dispute
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        currentTier: 2,
        status: 'tier2_voting',
        tierHistory: [...currentHistory, newTransition] as any,
        tier2Deadline,
        escalatedAt: now,
      },
    });

    // Create juror records
    for (const juror of jurors) {
      await tx.disputeJuror.create({
        data: {
          disputeId,
          jurorId: juror.userId,
          weight: calculateJuryWeight(juror),
        },
      });

      // Notify juror
      await notifyJuryDuty(juror.userId, disputeId, dispute.submission.task.title, tier2Deadline);
    }

    // Create audit log
    await tx.disputeAuditLog.create({
      data: {
        disputeId,
        action: 'escalated_to_tier2',
        detailsJson: {
          reason,
          jurorCount: jurors.length,
          deadline: tier2Deadline.toISOString(),
        },
      },
    });
  });

  // Notify parties
  await notifyDisputeEscalated(
    dispute.submission.workerId,
    disputeId,
    dispute.submission.task.title,
    2
  );
  await notifyDisputeEscalated(
    dispute.submission.task.requesterId,
    disputeId,
    dispute.submission.task.title,
    2
  );
}

/**
 * Select eligible jury members for a dispute
 */
async function selectJuryMembers(
  disputeId: string,
  workerId: string,
  requesterId: string
): Promise<Array<{ userId: string; reliabilityScore: number }>> {
  // Find eligible jurors:
  // - Reliability score >= 90
  // - Not the worker or requester
  // - Not already a juror on this dispute
  // - Has completed at least 5 tasks
  const eligibleJurors = await prisma.userStats.findMany({
    where: {
      reliabilityScore: { gte: JURY_MIN_RELIABILITY },
      userId: { notIn: [workerId, requesterId] },
      tasksAccepted: { gte: 5 },
    },
    select: {
      userId: true,
      reliabilityScore: true,
    },
    orderBy: {
      reliabilityScore: 'desc',
    },
    take: JURY_SIZE * 3, // Get more candidates for random selection
  });

  // Randomly select JURY_SIZE jurors from eligible pool
  const shuffled = eligibleJurors.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, JURY_SIZE);
}

/**
 * Calculate jury voting weight based on user stats
 */
function calculateJuryWeight(juror: { reliabilityScore: number }): number {
  // Base weight is 1.0, slightly adjusted by reliability
  // Max bonus of 0.2 for 100% reliability
  const reliabilityBonus = (juror.reliabilityScore - JURY_MIN_RELIABILITY) / 50; // 0 to 0.2
  return 1.0 + reliabilityBonus;
}

/**
 * Cast a jury vote
 */
export async function castJuryVote(
  disputeId: string,
  jurorId: string,
  vote: 'worker' | 'requester' | 'abstain',
  reason?: string
): Promise<void> {
  const jurorRecord = await prisma.disputeJuror.findUnique({
    where: {
      disputeId_jurorId: {
        disputeId,
        jurorId,
      },
    },
    include: {
      dispute: true,
    },
  });

  if (!jurorRecord) {
    throw new Error('You are not a juror for this dispute');
  }

  const disputeAny = jurorRecord.dispute as any;
  if (disputeAny.currentTier !== 2) {
    throw new Error('This dispute is not in the jury voting phase');
  }

  if (disputeAny.tier2Deadline && new Date() > disputeAny.tier2Deadline) {
    throw new Error('Voting deadline has passed');
  }

  if (jurorRecord.vote !== null) {
    throw new Error('You have already voted on this dispute');
  }

  await prisma.$transaction(async (tx) => {
    await tx.disputeJuror.update({
      where: { id: jurorRecord.id },
      data: {
        vote,
        reason,
        votedAt: new Date(),
      },
    });

    await tx.disputeAuditLog.create({
      data: {
        disputeId,
        action: 'jury_vote_cast',
        actorId: jurorId,
        detailsJson: {
          vote,
          weight: jurorRecord.weight,
        },
      },
    });
  });

  // Check if all votes are in
  await checkJuryVotingComplete(disputeId);
}

/**
 * Check if jury voting is complete and process result
 */
export async function checkJuryVotingComplete(disputeId: string): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      jurors: true,
      submission: {
        include: {
          task: true,
        },
      },
    },
  });

  const disputeAny = dispute as any;
  if (!dispute || disputeAny.currentTier !== 2) {
    return;
  }

  const jurors = disputeAny.jurors || [];
  const votedJurors = jurors.filter((j: any) => j.vote !== null);
  const allVoted = votedJurors.length === jurors.length;
  const majorityReached = votedJurors.length >= Math.ceil(jurors.length / 2) + 1;

  // Only process if all voted or deadline passed
  const deadlinePassed = disputeAny.tier2Deadline && new Date() > disputeAny.tier2Deadline;

  if (!allVoted && !deadlinePassed) {
    return;
  }

  // Calculate weighted votes
  let workerWeight = 0;
  let requesterWeight = 0;

  for (const juror of votedJurors) {
    if (juror.vote === 'worker') {
      workerWeight += juror.weight;
    } else if (juror.vote === 'requester') {
      requesterWeight += juror.weight;
    }
    // Abstain votes don't count
  }

  // Determine winner
  let outcome: 'worker_wins' | 'requester_wins';
  if (workerWeight > requesterWeight) {
    outcome = 'worker_wins';
  } else if (requesterWeight > workerWeight) {
    outcome = 'requester_wins';
  } else {
    // Tie goes to worker (benefit of the doubt for completed work)
    outcome = 'worker_wins';
  }

  await resolveDispute(disputeId, {
    outcome,
    reason: `Tier 2 Jury Resolution: Community jury voted ${outcome === 'worker_wins' ? 'in favor of' : 'against'} the worker. Worker votes: ${workerWeight.toFixed(2)} weight, Requester votes: ${requesterWeight.toFixed(2)} weight.`,
    tier: 2,
    juryDetails: {
      workerWeight,
      requesterWeight,
      totalJurors: jurors.length,
      votedJurors: votedJurors.length,
    },
  });
}

/**
 * Escalate dispute to Tier 3 (Admin Appeal)
 */
export async function escalateToTier3(
  disputeId: string,
  appellantId: string,
  appealStake: number
): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      submission: {
        include: {
          task: true,
        },
      },
    },
  });

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const disputeAny = dispute as any;
  if (disputeAny.currentTier !== 2 || dispute.status !== 'resolved') {
    throw new Error('Can only appeal resolved Tier 2 disputes');
  }

  // Verify appellant is a party to the dispute
  const isWorker = dispute.submission.workerId === appellantId;
  const isRequester = dispute.submission.task.requesterId === appellantId;
  if (!isWorker && !isRequester) {
    throw new Error('Only parties to the dispute can appeal');
  }

  // Verify the appellant lost
  const loser = dispute.resolutionType === 'accept_pay' ? 'requester' : 'worker';
  const appellantRole = isWorker ? 'worker' : 'requester';
  if (loser !== appellantRole) {
    throw new Error('Only the losing party can appeal');
  }

  // Verify appeal stake
  const requiredStake = dispute.submission.task.bountyAmount * APPEAL_STAKE_PERCENTAGE;
  if (appealStake < requiredStake) {
    throw new Error(`Appeal requires minimum stake of ${requiredStake}`);
  }

  const now = new Date();
  const tier3Deadline = new Date(now.getTime() + TIER3_DURATION_HOURS * 60 * 60 * 1000);

  const currentHistory = (disputeAny.tierHistory as TierTransition[]) || [];
  const newTransition: TierTransition = {
    from: 2,
    to: 3,
    reason: 'Loser appealed jury decision',
    actorId: appellantId,
    timestamp: now.toISOString(),
    details: { appealStake },
  };

  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        currentTier: 3,
        status: 'tier3_appeal',
        tierHistory: [...currentHistory, newTransition] as any,
        tier3Deadline,
        escalatedAt: now,
        escalationStake: appealStake,
        resolvedAt: null, // Clear previous resolution
        resolutionType: null,
        resolutionComment: null,
        resolverId: null,
      },
    });

    await tx.disputeAuditLog.create({
      data: {
        disputeId,
        action: 'escalated_to_tier3',
        actorId: appellantId,
        detailsJson: {
          reason: 'Appeal of Tier 2 jury decision',
          appealStake,
          deadline: tier3Deadline.toISOString(),
        },
      },
    });
  });

  // Notify parties
  await notifyDisputeEscalated(
    dispute.submission.workerId,
    disputeId,
    dispute.submission.task.title,
    3
  );
  await notifyDisputeEscalated(
    dispute.submission.task.requesterId,
    disputeId,
    dispute.submission.task.title,
    3
  );
}

/**
 * Admin resolves Tier 3 appeal
 */
export async function resolveAdminAppeal(
  disputeId: string,
  adminId: string,
  reverseDecision: boolean,
  reason: string
): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      submission: {
        include: {
          task: true,
        },
      },
    },
  });

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const disputeAny = dispute as any;
  if (disputeAny.currentTier !== 3 || dispute.status !== 'tier3_appeal') {
    throw new Error('This dispute is not in the admin appeal phase');
  }

  // Get the previous Tier 2 resolution from history
  const tierHistory = (disputeAny.tierHistory as TierTransition[]) || [];
  const tier2Resolution = tierHistory.find(t => t.to === 3);

  let outcome: 'worker_wins' | 'requester_wins';
  let finalReason: string;

  if (reverseDecision) {
    // Appellant wins - reverse the Tier 2 decision
    // If Tier 2 was worker_wins, now it's requester_wins, and vice versa
    const previousOutcome = dispute.resolutionType === 'accept_pay' ? 'worker_wins' : 'requester_wins';
    outcome = previousOutcome === 'worker_wins' ? 'requester_wins' : 'worker_wins';
    finalReason = `Tier 3 Admin Appeal: Previous jury decision reversed. ${reason}`;
  } else {
    // Appellant loses - uphold Tier 2 decision (from before it was appealed)
    // We need to get the previous resolution type from the tier history
    const prevResolution = tierHistory
      .filter(t => t.to === 2)
      .map(t => t.details as any)
      .find(d => d?.outcome);
    outcome = prevResolution?.outcome || 'worker_wins';
    finalReason = `Tier 3 Admin Appeal: Previous jury decision upheld. Appeal stake forfeited. ${reason}`;
  }

  await resolveDispute(disputeId, {
    outcome,
    reason: finalReason,
    tier: 3,
    resolverId: adminId,
    appealReversed: reverseDecision,
    escalationStake: disputeAny.escalationStake,
  });
}

/**
 * Resolve a dispute with the given outcome
 */
export async function resolveDispute(
  disputeId: string,
  params: {
    outcome: 'worker_wins' | 'requester_wins';
    reason: string;
    tier: number;
    splitPercentage?: number;
    resolverId?: string;
    juryDetails?: Record<string, unknown>;
    appealReversed?: boolean;
    escalationStake?: number | null;
  }
): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      submission: {
        include: {
          task: true,
          worker: {
            include: { workerProfile: true },
          },
        },
      },
    },
  });

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const { outcome, reason, tier, splitPercentage, resolverId, juryDetails, appealReversed, escalationStake } = params;

  // Determine resolution type
  let resolutionType: string;
  if (splitPercentage !== undefined && splitPercentage > 0 && splitPercentage < 100) {
    resolutionType = 'partial_pay';
  } else if (outcome === 'worker_wins') {
    resolutionType = 'accept_pay';
  } else {
    resolutionType = 'reject_refund';
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Update dispute
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'resolved',
        resolutionType,
        resolutionComment: reason,
        splitPercentage: splitPercentage || (outcome === 'worker_wins' ? 100 : 0),
        resolverId: resolverId || null,
        resolvedAt: now,
      },
    });

    // Update submission status
    const submissionStatus = outcome === 'worker_wins' ? 'accepted' : 'rejected';
    await tx.submission.update({
      where: { id: dispute.submissionId },
      data: { status: submissionStatus },
    });

    // Update task status if worker wins
    if (outcome === 'worker_wins') {
      await tx.task.update({
        where: { id: dispute.submission.taskId },
        data: { status: 'accepted' },
      });
    }

    // Create audit log
    await tx.disputeAuditLog.create({
      data: {
        disputeId,
        action: `tier${tier}_resolved`,
        actorId: resolverId,
        detailsJson: JSON.stringify({
          outcome,
          resolutionType,
          splitPercentage,
          reason,
          juryDetails: juryDetails || null,
          appealReversed,
          escalationStake,
        }),
      },
    });
  });

  // Update reputation stats
  await Promise.all([
    recalculateUserStats(dispute.submission.workerId, {
      reason: 'dispute_resolved',
      taskId: dispute.submission.taskId,
      submissionId: dispute.submissionId,
    }),
    recalculateUserStats(dispute.submission.task.requesterId),
  ]);

  // Notify parties
  await notifyDisputeResolved(
    dispute.submission.workerId,
    disputeId,
    dispute.submission.task.title,
    resolutionType,
    true
  );
  await notifyDisputeResolved(
    dispute.submission.task.requesterId,
    disputeId,
    dispute.submission.task.title,
    resolutionType,
    false
  );
}

/**
 * Get jury status for a dispute
 */
export async function getJuryStatus(disputeId: string): Promise<{
  totalJurors: number;
  votedCount: number;
  deadline: string | null;
  votes: Array<{
    jurorId: string;
    hasVoted: boolean;
    weight: number;
  }>;
  results?: {
    workerVotes: number;
    requesterVotes: number;
    abstainVotes: number;
    workerWeight: number;
    requesterWeight: number;
  };
}> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      jurors: true,
    },
  });

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found`);
  }

  const disputeAny = dispute as any;
  const jurors = disputeAny.jurors || [];
  const votedJurors = jurors.filter((j: any) => j.vote !== null);

  // Only show detailed results if resolved
  let results: any;
  if (dispute.status === 'resolved') {
    let workerWeight = 0;
    let requesterWeight = 0;
    let workerVotes = 0;
    let requesterVotes = 0;
    let abstainVotes = 0;

    for (const juror of jurors) {
      if (juror.vote === 'worker') {
        workerVotes++;
        workerWeight += juror.weight;
      } else if (juror.vote === 'requester') {
        requesterVotes++;
        requesterWeight += juror.weight;
      } else if (juror.vote === 'abstain') {
        abstainVotes++;
      }
    }

    results = {
      workerVotes,
      requesterVotes,
      abstainVotes,
      workerWeight,
      requesterWeight,
    };
  }

  return {
    totalJurors: jurors.length,
    votedCount: votedJurors.length,
    deadline: disputeAny.tier2Deadline?.toISOString() || null,
    votes: jurors.map((j: any) => ({
      jurorId: j.jurorId,
      hasVoted: j.vote !== null,
      weight: j.weight,
    })),
    results,
  };
}

/**
 * Get disputes available for jury duty for a user
 */
export async function getJuryPoolForUser(userId: string): Promise<Array<{
  disputeId: string;
  taskTitle: string;
  bountyAmount: number;
  currency: string;
  deadline: string | null;
  hasVoted: boolean;
}>> {
  const jurorRecords = await prisma.disputeJuror.findMany({
    where: {
      jurorId: userId,
    },
    include: {
      dispute: {
        include: {
          submission: {
            include: {
              task: true,
            },
          },
        },
      },
    },
    orderBy: {
      selectedAt: 'desc',
    },
  });

  return jurorRecords
    .filter(r => {
      const disputeAny = r.dispute as any;
      return disputeAny.currentTier === 2 && r.dispute.status === 'tier2_voting';
    })
    .map(r => {
      const disputeAny = r.dispute as any;
      return {
        disputeId: r.disputeId,
        taskTitle: r.dispute.submission.task.title,
        bountyAmount: r.dispute.submission.task.bountyAmount,
        currency: r.dispute.submission.task.currency,
        deadline: disputeAny.tier2Deadline?.toISOString() || null,
        hasVoted: r.vote !== null,
      };
    });
}

/**
 * Calculate Haversine distance between two coordinates in meters
 */
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
