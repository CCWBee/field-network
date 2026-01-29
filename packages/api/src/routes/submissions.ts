import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../services/database';
import { releaseEscrow } from '../services/escrow';
import { recalculateUserStats } from '../services/reputation';
import { generateUploadUrl } from '../services/storage';
import { authenticate, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError, StateTransitionError } from '../middleware/errorHandler';
import { createHash } from 'crypto';
import {
  notifySubmissionReceived,
  notifySubmissionAccepted,
  notifySubmissionRejected,
  notifyBadgeEarned,
  notifyFeeTierUpgrade,
} from '../services/notifications';
import {
  calculatePlatformFee,
  recordFeeLedgerEntry,
  checkTierPromotion,
} from '../services/fees';
import { dispatchWebhookEvent } from '../jobs/webhook-delivery';
import { releaseTaskStake } from '../services/staking';

// Helper to safely extract string from query/param
function qs(param: any): string | undefined {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && typeof param[0] === 'string') return param[0];
  return undefined;
}

const router = Router();

// POST /v1/tasks/:taskId/submissions - Create submission
router.post('/:taskId/submissions', authenticate, requireScope('submissions:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string;

    // Check claim exists and is active
    const claimRaw = await prisma.taskClaim.findFirst({
      where: {
        taskId: taskId as string,
        workerId: req.user!.userId,
        status: 'active',
      },
      include: { task: true },
    });

    if (!claimRaw) {
      throw new ValidationError('You must have an active claim to submit');
    }

    const claim = claimRaw as any;

    // Check claim hasn't expired
    if (new Date() > claim.claimedUntil) {
      throw new ValidationError('Your claim has expired');
    }

    // Create submission
    const submission = await prisma.$transaction(async (tx) => {
      // Update claim status
      await tx.taskClaim.update({
        where: { id: claim.id },
        data: { status: 'converted' },
      });

      // Create submission
      return tx.submission.create({
        data: {
          taskId,
          workerId: req.user!.userId,
          status: 'created',
          proofBundleJson: '{}',
          verificationJson: '{}',
          verificationScore: 0,
          flagsJson: '[]',
        },
      });
    });

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'submission.created',
        objectType: 'submission',
        objectId: submission.id,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ taskId }),
      },
    });

    // Dispatch webhook event
    await dispatchWebhookEvent('submission.created', {
      submission_id: submission.id,
      task_id: taskId,
      worker_id: req.user!.userId,
      status: submission.status,
      created_at: submission.createdAt.toISOString(),
    }, claim.task.requesterId);

    res.status(201).json({
      submission_id: submission.id,
      task_id: taskId,
      status: submission.status,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/submissions/:submissionId/artefacts - Init artefact upload
router.post('/:submissionId/artefacts', authenticate, requireScope('submissions:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submissionId = req.params.submissionId as string;
    const { type, filename, content_type, size_bytes } = req.body;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundError('Submission');
    }

    if (submission.workerId !== req.user!.userId) {
      throw new NotFoundError('Submission');
    }

    if (!['created', 'uploading'].includes(submission.status)) {
      throw new ValidationError('Submission is not accepting uploads');
    }

    // Generate storage key and upload URL
    const artefactId = uuidv4();
    const storageKey = `${process.env.NODE_ENV || 'dev'}/${submission.taskId}/${submissionId as string}/${artefactId}/${filename}`;

    // Create artefact record
    const artefact = await prisma.artefact.create({
      data: {
        submissionId: submissionId as string,
        type: type || 'photo',
        storageKey,
        sha256: '', // Will be set after upload
        sizeBytes: size_bytes || 0,
        widthPx: 0,
        heightPx: 0,
        exifJson: '{}',
      },
    });

    // Update submission status
    if (submission.status === 'created') {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: 'uploading' },
      });
    }

    // Generate signed upload URL
    const uploadResult = await generateUploadUrl(storageKey, {
      contentType: content_type || 'image/jpeg',
      expiresIn: 3600,
      expectedSizeBytes: size_bytes,
    });

    if (!uploadResult.success || !uploadResult.data) {
      throw new Error(`Failed to generate upload URL: ${uploadResult.error}`);
    }

    res.status(201).json({
      artefact_id: artefact.id,
      upload_id: uploadResult.data.uploadId,
      upload_url: uploadResult.data.uploadUrl,
      storage_key: storageKey,
      upload_method: uploadResult.data.method,
      upload_headers: uploadResult.data.headers,
      expires_at: uploadResult.data.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/submissions/:submissionId/finalise - Finalise submission
router.post('/:submissionId/finalise', authenticate, requireScope('submissions:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submissionId = req.params.submissionId as string;
    const { capture_claims } = req.body;

    const submissionRaw = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        artefacts: true,
        task: true,
      },
    });

    if (!submissionRaw) {
      throw new NotFoundError('Submission');
    }

    const submission = submissionRaw as any;

    if (submission.workerId !== req.user!.userId) {
      throw new NotFoundError('Submission');
    }

    if (submission.status !== 'uploading') {
      throw new ValidationError('Submission is not ready for finalisation');
    }

    // Check minimum artefacts
    const requirements = JSON.parse(typeof submission.task.requirementsJson === 'string' ? submission.task.requirementsJson : JSON.stringify(submission.task.requirementsJson || {}));
    if (submission.artefacts.length < (requirements?.photos?.count || 1)) {
      throw new ValidationError(`Minimum ${requirements?.photos?.count || 1} photos required`);
    }

    // Build proof bundle
    const proofBundle = {
      bundle_id: uuidv4(),
      task_id: submission.taskId,
      submission_id: submission.id,
      worker_id: submission.workerId,
      capture_claims: capture_claims || {},
      artefacts: submission.artefacts.map((a: any) => ({
        id: a.id,
        type: a.type,
        storage_key: a.storageKey,
        sha256: a.sha256,
        dimensions: { width: a.widthPx, height: a.heightPx },
      })),
      finalised_at: new Date().toISOString(),
    };

    // Hash the proof bundle
    const bundleHash = createHash('sha256')
      .update(JSON.stringify(proofBundle, Object.keys(proofBundle).sort()))
      .digest('hex');

    // Run verification checks
    const verificationResult = await runVerificationChecks(submission, proofBundle);

    // Update submission
    const updatedSubmission = await prisma.$transaction(async (tx) => {
      // Update task status
      await tx.task.update({
        where: { id: submission.taskId },
        data: { status: 'submitted' },
      });

      return tx.submission.update({
        where: { id: submissionId },
        data: {
          status: 'finalised',
          finalisedAt: new Date(),
          proofBundleJson: JSON.stringify(proofBundle),
          proofBundleHash: bundleHash,
          verificationJson: JSON.stringify(verificationResult),
          verificationScore: verificationResult.score,
          flagsJson: JSON.stringify(verificationResult.flags),
        },
      });
    });

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'submission.finalised',
        objectType: 'submission',
        objectId: submission.id,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ bundleHash, score: verificationResult.score }),
      },
    });

    await recalculateUserStats(req.user!.userId);

    // Notify the task requester that a submission was received
    const worker = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { username: true, ensName: true, email: true },
    });
    const workerName = worker?.username || worker?.ensName || worker?.email?.split('@')[0] || 'A worker';
    await notifySubmissionReceived(
      submission.task.requesterId,
      submission.taskId,
      submission.task.title,
      submission.id,
      workerName,
      verificationResult.score
    );

    res.json({
      submission_id: updatedSubmission.id,
      status: updatedSubmission.status,
      proof_bundle_hash: bundleHash,
      verification_score: verificationResult.score,
      checks_passed: verificationResult.passed,
      checks_failed: verificationResult.failed,
      flags: verificationResult.flags,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/submissions/:submissionId - Get submission details
router.get('/:submissionId', authenticate, requireScope('submissions:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submissionRaw = await prisma.submission.findUnique({
      where: { id: req.params.submissionId as string },
      include: {
        artefacts: true,
        task: true,
        decisions: true,
      },
    });

    if (!submissionRaw) {
      throw new NotFoundError('Submission');
    }

    const submission = submissionRaw as any;

    // Only allow owner, requester, or admin to view
    const isOwner = submission.workerId === req.user!.userId;
    const isRequester = submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isOwner && !isRequester && !isAdmin) {
      throw new NotFoundError('Submission');
    }

    res.json({
      id: submission.id,
      task_id: submission.taskId,
      worker_id: submission.workerId,
      status: submission.status,
      created_at: submission.createdAt.toISOString(),
      finalised_at: submission.finalisedAt?.toISOString(),
      proof_bundle_hash: submission.proofBundleHash,
      verification_score: submission.verificationScore,
      flags: JSON.parse(typeof submission.flagsJson === 'string' ? submission.flagsJson : JSON.stringify(submission.flagsJson || [])),
      artefacts: submission.artefacts.map((a: any) => ({
        id: a.id,
        type: a.type,
        sha256: a.sha256,
        dimensions: { width: a.widthPx, height: a.heightPx },
        captured_at: a.capturedAt?.toISOString(),
      })),
      decisions: submission.decisions,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/submissions/:submissionId/accept - Accept submission
router.post('/:submissionId/accept', authenticate, requireScope('decisions:accept'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submissionId = req.params.submissionId as string;

    const submissionRaw = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!submissionRaw) {
      throw new NotFoundError('Submission');
    }

    const submission = submissionRaw as any;

    // Only requester or admin can accept
    if (submission.task.requesterId !== req.user!.userId && req.user!.role !== 'admin') {
      throw new NotFoundError('Submission');
    }

    if (submission.status !== 'finalised') {
      throw new ValidationError('Only finalised submissions can be accepted');
    }

    await prisma.$transaction(async (tx) => {
      // Update submission
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: 'accepted' },
      });

      // Update task
      await tx.task.update({
        where: { id: submission.taskId },
        data: { status: 'accepted' },
      });

      // Create decision record
      await tx.decision.create({
        data: {
          submissionId: submissionId as string,
          actorId: req.user!.userId,
          decisionType: 'accept',
          comment: req.body.comment,
        },
      });
    });

    const [workerResult] = await Promise.all([
      recalculateUserStats(submission.workerId, {
        reason: 'task_accepted',
        taskId: submission.taskId,
        submissionId: submissionId as string,
      }),
      recalculateUserStats(submission.task.requesterId),
    ]);

    // Release escrow to worker (outside transaction for cleaner error handling)
    const escrowResult = await releaseEscrow(submission.taskId, submission.workerId);
    if (!escrowResult.success) {
      // Log but don't fail - submission is accepted, escrow release can be retried
      console.error(`Escrow release failed for task ${submission.taskId}: ${escrowResult.error}`);
    }

    // Release stake back to worker (successful submission)
    const stakeResult = await releaseTaskStake(submission.taskId, submission.workerId);
    if (!stakeResult.success) {
      console.error(`Stake release failed for task ${submission.taskId}: ${stakeResult.error}`);
    }

    // Record platform fee in ledger
    const feeInfo = await calculatePlatformFee(submission.task.requesterId, submission.task.bountyAmount);
    if (feeInfo.fee > 0) {
      await recordFeeLedgerEntry({
        taskId: submission.taskId,
        submissionId,
        feeType: 'platform',
        amount: feeInfo.fee,
        currency: submission.task.currency,
        payerId: submission.task.requesterId,
        metadata: {
          tier_name: feeInfo.tierName,
          rate: feeInfo.rate,
          bounty_amount: submission.task.bountyAmount,
        },
      });
    }

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'submission.accepted',
        objectType: 'submission',
        objectId: submissionId,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ fee: feeInfo.fee, tier: feeInfo.tierName }),
      },
    });

    // Notify the worker that their submission was accepted
    await notifySubmissionAccepted(
      submission.workerId,
      submission.taskId,
      submission.task.title,
      submissionId,
      submission.task.bountyAmount,
      submission.task.currency
    );

    // Notify about any badges earned
    for (const badgeType of workerResult.awardedBadges) {
      const badgeDef = await prisma.badgeDefinition.findUnique({
        where: { type: badgeType },
      });
      if (badgeDef) {
        await notifyBadgeEarned(
          submission.workerId,
          badgeType,
          badgeDef.name,
          badgeDef.description
        );
      }
    }

    // Check if the worker has been promoted to a new fee tier
    const tierPromotion = await checkTierPromotion(submission.workerId);
    if (tierPromotion?.promoted && tierPromotion.newTier) {
      await notifyFeeTierUpgrade(
        submission.workerId,
        tierPromotion.newTier.name,
        tierPromotion.newTier.rate
      );
    }

    // Dispatch webhook events
    await dispatchWebhookEvent('submission.accepted', {
      submission_id: submissionId,
      task_id: submission.taskId,
      worker_id: submission.workerId,
      bounty_amount: submission.task.bountyAmount,
      currency: submission.task.currency,
      accepted_at: new Date().toISOString(),
    }, submission.task.requesterId);

    // Also dispatch task.completed event
    await dispatchWebhookEvent('task.completed', {
      task_id: submission.taskId,
      submission_id: submissionId,
      worker_id: submission.workerId,
      bounty_amount: submission.task.bountyAmount,
      currency: submission.task.currency,
      completed_at: new Date().toISOString(),
    }, submission.task.requesterId);

    res.json({
      submission_id: submissionId,
      status: 'accepted',
      message: 'Submission accepted, payment released',
      fee_charged: {
        amount: feeInfo.fee,
        rate: feeInfo.rate,
        tier: feeInfo.tierName,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/submissions/:submissionId/reject - Reject submission
router.post('/:submissionId/reject', authenticate, requireScope('decisions:reject'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submissionId = req.params.submissionId as string;
    const { reason_code, comment } = req.body;

    if (!reason_code) {
      throw new ValidationError('reason_code is required');
    }

    const submissionRaw = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!submissionRaw) {
      throw new NotFoundError('Submission');
    }

    const submission = submissionRaw as any;

    if (submission.task.requesterId !== req.user!.userId && req.user!.role !== 'admin') {
      throw new NotFoundError('Submission');
    }

    if (submission.status !== 'finalised') {
      throw new ValidationError('Only finalised submissions can be rejected');
    }

    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: 'rejected' },
      });

      await tx.decision.create({
        data: {
          submissionId: submissionId as string,
          actorId: req.user!.userId,
          decisionType: 'reject',
          reasonCode: reason_code,
          comment,
        },
      });
    });

    await Promise.all([
      recalculateUserStats(submission.workerId, {
        reason: 'task_rejected',
        taskId: submission.taskId,
        submissionId: submissionId as string,
      }),
      recalculateUserStats(submission.task.requesterId),
    ]);

    // Release stake back to worker (benefit of doubt - rejection without dispute returns stake)
    // Worker can dispute if they believe rejection was unfair
    const stakeResult = await releaseTaskStake(submission.taskId, submission.workerId);
    if (!stakeResult.success) {
      console.error(`Stake release failed for rejected task ${submission.taskId}: ${stakeResult.error}`);
    }

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'submission.rejected',
        objectType: 'submission',
        objectId: submissionId as string,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ reason_code, stake_released: stakeResult.success }),
      },
    });

    // Notify the worker that their submission was rejected
    await notifySubmissionRejected(
      submission.workerId,
      submission.taskId,
      submission.task.title,
      submissionId as string,
      reason_code
    );

    // Dispatch webhook event
    await dispatchWebhookEvent('submission.rejected', {
      submission_id: submissionId,
      task_id: submission.taskId,
      worker_id: submission.workerId,
      reason_code,
      comment: comment || null,
      rejected_at: new Date().toISOString(),
      dispute_window_hours: 48,
    }, submission.task.requesterId);

    res.json({
      submission_id: submissionId,
      status: 'rejected',
      reason_code,
      dispute_window_hours: 48,
    });
  } catch (error) {
    next(error);
  }
});

// Haversine distance calculation (meters)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Normalize bearing to 0-360
function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

// Check if bearing is within tolerance
function bearingWithinTolerance(actual: number, target: number, tolerance: number): boolean {
  const diff = Math.abs(normalizeBearing(actual) - normalizeBearing(target));
  return diff <= tolerance || diff >= (360 - tolerance);
}

// Verification helper
async function runVerificationChecks(submission: any, proofBundle: any) {
  const checks = {
    passed: [] as string[],
    failed: [] as string[],
    flags: [] as string[],
    score: 0,
  };

  const requirements = JSON.parse(submission.task.requirementsJson);

  // Check 1: Artefact count
  if (submission.artefacts.length >= (requirements?.photos?.count || 1)) {
    checks.passed.push('artefact_count');
  } else {
    checks.failed.push('artefact_count');
  }

  // Check 2: Time window
  const taskStart = new Date(submission.task.timeStart);
  const taskEnd = new Date(submission.task.timeEnd);
  const now = new Date();

  if (now >= taskStart && now <= taskEnd) {
    checks.passed.push('time_window');
  } else {
    checks.failed.push('time_window');
    checks.flags.push('outside_time_window');
  }

  // Check 3: GPS/Location verification
  const taskLat = submission.task.locationLat;
  const taskLon = submission.task.locationLon;
  const taskRadius = submission.task.radiusM;

  let locationPassed = true;
  for (const artefact of submission.artefacts) {
    if (artefact.gpsLat != null && artefact.gpsLon != null) {
      const distance = calculateDistance(taskLat, taskLon, artefact.gpsLat, artefact.gpsLon);
      if (distance > taskRadius) {
        locationPassed = false;
        checks.flags.push(`artefact_${artefact.id}_outside_radius`);
      }
    } else {
      // No GPS data - flag but don't fail (could be stripped)
      checks.flags.push(`artefact_${artefact.id}_no_gps`);
    }
  }

  if (locationPassed) {
    checks.passed.push('location_verification');
  } else {
    checks.failed.push('location_verification');
  }

  // Check 4: Bearing verification (if required)
  const bearingReq = requirements?.bearing;
  if (bearingReq?.required && bearingReq?.target_deg != null) {
    let bearingPassed = true;
    const tolerance = bearingReq.tolerance_deg || 45; // Default 45 degree tolerance

    for (const artefact of submission.artefacts) {
      if (artefact.bearing != null) {
        if (!bearingWithinTolerance(artefact.bearing, bearingReq.target_deg, tolerance)) {
          bearingPassed = false;
          checks.flags.push(`artefact_${artefact.id}_wrong_bearing`);
        }
      } else {
        // No bearing data available
        checks.flags.push(`artefact_${artefact.id}_no_bearing`);
      }
    }

    if (bearingPassed) {
      checks.passed.push('bearing_verification');
    } else {
      checks.failed.push('bearing_verification');
    }
  }

  // Check 5: Duplicate hash detection
  const artefactHashes = submission.artefacts
    .filter((a: any) => a.sha256)
    .map((a: any) => a.sha256);

  if (artefactHashes.length > 0) {
    // Check for duplicates in other submissions
    const duplicates = await prisma.artefact.findMany({
      where: {
        sha256: { in: artefactHashes },
        submissionId: { not: submission.id },
      },
      select: {
        id: true,
        sha256: true,
        submissionId: true,
      },
    });

    if (duplicates.length > 0) {
      checks.failed.push('duplicate_detection');
      for (const dup of duplicates) {
        checks.flags.push(`duplicate_sha256_${dup.sha256.substring(0, 8)}`);
      }
    } else {
      checks.passed.push('duplicate_detection');
    }
  } else {
    checks.passed.push('duplicate_detection'); // No hashes to check
  }

  // Check 6: Image dimensions (if specified)
  const minWidth = requirements?.photos?.min_width_px;
  const minHeight = requirements?.photos?.min_height_px;

  if (minWidth || minHeight) {
    let dimensionsPassed = true;
    for (const artefact of submission.artefacts) {
      if (minWidth && artefact.widthPx < minWidth) {
        dimensionsPassed = false;
        checks.flags.push(`artefact_${artefact.id}_width_too_small`);
      }
      if (minHeight && artefact.heightPx < minHeight) {
        dimensionsPassed = false;
        checks.flags.push(`artefact_${artefact.id}_height_too_small`);
      }
    }

    if (dimensionsPassed) {
      checks.passed.push('image_dimensions');
    } else {
      checks.failed.push('image_dimensions');
    }
  }

  // Calculate score
  const totalChecks = checks.passed.length + checks.failed.length;
  checks.score = totalChecks > 0 ? Math.round((checks.passed.length / totalChecks) * 100) : 0;

  return checks;
}

export default router;
