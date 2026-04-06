import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { prisma } from '../services/database';
import { calculateArbitrationFee } from '../services/fees';
import { recalculateUserStats } from '../services/reputation';
import { authenticate, requireRole, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler';
import { notifyDisputeOpened, notifyDisputeResolved } from '../services/notifications';
import {
  uploadFile,
  generateDownloadUrl,
  getStorageProvider,
  LocalStorageProvider,
  downloadFile,
} from '../services/storage';
import { dispatchWebhookEvent } from '../jobs/webhook-delivery';
import {
  runTier1AutoScore,
  processTier1Result,
  escalateToTier2,
  escalateToTier3,
  castJuryVote,
  getJuryStatus,
  getJuryPoolForUser,
  resolveAdminAppeal,
} from '../services/disputes';
import { slashTaskStake, releaseTaskStake, stakingProvider } from '../services/staking';

const router = Router();

// Evidence deadline: 48 hours from dispute open
const EVIDENCE_DEADLINE_HOURS = 48;
// Max evidence items per party
const MAX_EVIDENCE_PER_PARTY = 10;

// Configure multer for evidence uploads
const tempStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(os.tmpdir(), 'field-network-evidence');
    try {
      await fs.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (err) {
      cb(err as Error, tempDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `evidence-${uniqueSuffix}${ext}`);
  },
});

const evidenceUpload = multer({
  storage: tempStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
      'application/pdf',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.'));
    }
  },
});

/**
 * Clean up temporary file after upload
 */
async function cleanupTempFile(filePath: string | undefined): Promise<void> {
  if (filePath) {
    await fs.unlink(filePath).catch(() => {});
  }
}

/**
 * Check if evidence deadline has passed
 */
function isEvidenceDeadlinePassed(dispute: { evidenceDeadline: Date | null; openedAt: Date }): boolean {
  const deadline = dispute.evidenceDeadline || new Date(dispute.openedAt.getTime() + EVIDENCE_DEADLINE_HOURS * 60 * 60 * 1000);
  return new Date() > deadline;
}

// GET /v1/disputes/jury-pool - Get disputes available for jury duty for current user
// NOTE: This route MUST be before /:disputeId routes due to Express path matching
router.get('/jury-pool', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputes = await getJuryPoolForUser(req.user!.userId);

    res.json({
      disputes,
      total: disputes.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/disputes - List disputes (admin only)
router.get('/', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = (req.query.limit as string) || '20';
    const offset = (req.query.offset as string) || '0';

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const disputesRaw = await prisma.dispute.findMany({
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
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    const disputes = disputesRaw as any[];
    const total = await prisma.dispute.count({ where });

    res.json({
      disputes: disputes.map((d: any) => ({
        id: d.id,
        submission_id: d.submissionId,
        opened_by: d.openedBy,
        status: d.status,
        resolution_type: d.resolutionType,
        resolution_comment: d.resolutionComment,
        resolver_id: d.resolverId,
        opened_at: d.openedAt.toISOString(),
        resolved_at: d.resolvedAt?.toISOString(),
        evidence_deadline: d.evidenceDeadline?.toISOString(),
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
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/submissions/:submissionId/dispute - Open a dispute
router.post('/submissions/:submissionId/dispute', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submissionId = req.params.submissionId as string;
    const { reason } = z.object({
      reason: z.string().min(10).max(1000).optional(),
    }).parse(req.body);

    const submissionRaw = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { task: true },
    });

    if (!submissionRaw) {
      throw new NotFoundError('Submission');
    }

    const submission = submissionRaw as any;

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

    // Calculate evidence deadline (48 hours from now)
    const evidenceDeadline = new Date(Date.now() + EVIDENCE_DEADLINE_HOURS * 60 * 60 * 1000);

    const dispute = await prisma.dispute.create({
      data: {
        submissionId,
        openedBy: req.user!.userId,
        status: 'opened',
        resolutionComment: reason,
        evidenceDeadline,
      },
    });

    // Update submission status
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'disputed' },
    });

    // Create audit log entry
    await prisma.disputeAuditLog.create({
      data: {
        disputeId: dispute.id,
        action: 'created',
        actorId: req.user!.userId,
        detailsJson: JSON.stringify({
          reason,
          evidence_deadline: evidenceDeadline.toISOString(),
        }),
      },
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

    // Dispatch webhook event to both parties
    await dispatchWebhookEvent('dispute.opened', {
      dispute_id: dispute.id,
      submission_id: submissionId,
      task_id: submission.taskId,
      task_title: submission.task.title,
      opened_by: req.user!.userId,
      worker_id: submission.workerId,
      requester_id: submission.task.requesterId,
      reason: reason || null,
      opened_at: dispute.openedAt.toISOString(),
      evidence_deadline: evidenceDeadline.toISOString(),
    }, submission.workerId);

    await dispatchWebhookEvent('dispute.opened', {
      dispute_id: dispute.id,
      submission_id: submissionId,
      task_id: submission.taskId,
      task_title: submission.task.title,
      opened_by: req.user!.userId,
      worker_id: submission.workerId,
      requester_id: submission.task.requesterId,
      reason: reason || null,
      opened_at: dispute.openedAt.toISOString(),
      evidence_deadline: evidenceDeadline.toISOString(),
    }, submission.task.requesterId);

    res.status(201).json({
      dispute_id: dispute.id,
      submission_id: submissionId,
      status: dispute.status,
      opened_at: dispute.openedAt.toISOString(),
      evidence_deadline: evidenceDeadline.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/disputes/:disputeId - Get dispute details
router.get('/:disputeId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;

    const disputeRaw = await prisma.dispute.findUnique({
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

    const dispute = disputeRaw as any;

    // Check access - admin, requester, or worker
    const isWorker = dispute.submission.workerId === req.user!.userId;
    const isRequester = dispute.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Dispute');
    }

    // Generate download URLs for evidence files
    const evidenceWithUrls = await Promise.all(
      dispute.evidence.map(async (e: any) => {
        let downloadUrl: string | null = null;
        if (e.storageKey) {
          try {
            const urlResult = await generateDownloadUrl(e.storageKey, { expiresIn: 3600 });
            if (urlResult.success && urlResult.data) {
              downloadUrl = urlResult.data.downloadUrl;
            }
          } catch {
            // Ignore errors, download URL will be null
          }
        }
        return {
          id: e.id,
          submitted_by: e.submittedBy,
          submitter: {
            id: e.submitter.id,
            email: e.submitter.email,
            username: e.submitter.username,
          },
          type: e.type,
          description: e.description,
          storage_key: e.storageKey,
          mime_type: e.mimeType,
          size_bytes: e.sizeBytes,
          download_url: downloadUrl,
          created_at: e.createdAt.toISOString(),
        };
      })
    );

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
      resolved_at: dispute.resolvedAt?.toISOString(),
      evidence_deadline: dispute.evidenceDeadline?.toISOString(),
      evidence_deadline_passed: isEvidenceDeadlinePassed(dispute),
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
          requester_id: dispute.submission.task.requesterId,
          requirements: JSON.parse(dispute.submission.task.requirementsJson as string),
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
      evidence: evidenceWithUrls,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// EVIDENCE ENDPOINTS
// ============================================================================

const EvidenceTextSchema = z.object({
  description: z.string().min(10).max(5000),
});

// POST /v1/disputes/:disputeId/evidence - Upload evidence (file or text)
router.post(
  '/:disputeId/evidence',
  authenticate,
  evidenceUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const disputeId = req.params.disputeId as string;
      const { description } = EvidenceTextSchema.parse(req.body);

      const disputeRaw = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: {
          submission: {
            include: {
              task: true,
            },
          },
          evidence: true,
        },
      });

      if (!disputeRaw) {
        await cleanupTempFile(req.file?.path);
        throw new NotFoundError('Dispute');
      }

      const dispute = disputeRaw as any;

      // Check access - only requester or worker can submit evidence
      const isWorker = dispute.submission.workerId === req.user!.userId;
      const isRequester = dispute.submission.task.requesterId === req.user!.userId;

      if (!isWorker && !isRequester) {
        await cleanupTempFile(req.file?.path);
        throw new ForbiddenError('Only the worker or requester can submit evidence');
      }

      // Check if dispute is resolved
      if (dispute.status === 'resolved') {
        await cleanupTempFile(req.file?.path);
        throw new ValidationError('Cannot submit evidence for a resolved dispute');
      }

      // Check if evidence deadline has passed
      if (isEvidenceDeadlinePassed(dispute)) {
        await cleanupTempFile(req.file?.path);
        throw new ValidationError('Evidence submission deadline has passed');
      }

      // Check max evidence per party
      const userEvidenceCount = dispute.evidence.filter((e: any) => e.submittedBy === req.user!.userId).length;
      if (userEvidenceCount >= MAX_EVIDENCE_PER_PARTY) {
        await cleanupTempFile(req.file?.path);
        throw new ValidationError(`Maximum ${MAX_EVIDENCE_PER_PARTY} evidence items allowed per party`);
      }

      let evidenceData: {
        disputeId: string;
        submittedBy: string;
        type: string;
        description: string;
        storageKey?: string;
        mimeType?: string;
        sizeBytes?: number;
        sha256?: string;
      } = {
        disputeId,
        submittedBy: req.user!.userId,
        type: 'text',
        description,
      };

      // If file was uploaded, process it
      if (req.file) {
        const fileBuffer = await fs.readFile(req.file.path);
        const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

        // Generate storage key
        const ext = path.extname(req.file.originalname);
        const storageKey = `disputes/${disputeId}/evidence/${Date.now()}-${sha256.slice(0, 8)}${ext}`;

        // Upload to storage
        const uploadResult = await uploadFile(storageKey, fileBuffer, req.file.mimetype);

        if (!uploadResult.success) {
          await cleanupTempFile(req.file.path);
          throw new Error(`Storage upload failed: ${uploadResult.error}`);
        }

        await cleanupTempFile(req.file.path);

        // Determine evidence type
        const isImage = req.file.mimetype.startsWith('image/');
        const isPdf = req.file.mimetype === 'application/pdf';

        evidenceData = {
          ...evidenceData,
          type: isImage ? 'image' : isPdf ? 'document' : 'document',
          storageKey,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          sha256,
        };
      }

      // Create evidence record
      const evidence = await prisma.disputeEvidence.create({
        data: evidenceData,
      });

      // Create audit log entry
      await prisma.disputeAuditLog.create({
        data: {
          disputeId,
          action: 'evidence_added',
          actorId: req.user!.userId,
          detailsJson: JSON.stringify({
            evidence_id: evidence.id,
            type: evidence.type,
            has_file: !!req.file,
            party: isWorker ? 'worker' : 'requester',
          }),
        },
      });

      // Update dispute status to evidence_pending if still in opened state
      if (dispute.status === 'opened') {
        await prisma.dispute.update({
          where: { id: disputeId },
          data: { status: 'evidence_pending' },
        });
      }

      res.status(201).json({
        id: evidence.id,
        dispute_id: evidence.disputeId,
        submitted_by: evidence.submittedBy,
        type: evidence.type,
        description: evidence.description,
        storage_key: evidence.storageKey,
        mime_type: evidence.mimeType,
        size_bytes: evidence.sizeBytes,
        created_at: evidence.createdAt.toISOString(),
      });
    } catch (error) {
      await cleanupTempFile(req.file?.path);
      next(error);
    }
  }
);

// GET /v1/disputes/:disputeId/evidence - List evidence for a dispute
router.get('/:disputeId/evidence', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
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

    const dispute = disputeRaw as any;

    // Check access - admin, requester, or worker
    const isWorker = dispute.submission.workerId === req.user!.userId;
    const isRequester = dispute.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Dispute');
    }

    // Generate download URLs for evidence files
    const evidenceWithUrls = await Promise.all(
      dispute.evidence.map(async (e: any) => {
        let downloadUrl: string | null = null;
        if (e.storageKey) {
          try {
            const urlResult = await generateDownloadUrl(e.storageKey, { expiresIn: 3600 });
            if (urlResult.success && urlResult.data) {
              downloadUrl = urlResult.data.downloadUrl;
            }
          } catch {
            // Ignore errors, download URL will be null
          }
        }

        // Determine party (worker or requester)
        const party = e.submittedBy === dispute.submission.workerId ? 'worker' : 'requester';

        return {
          id: e.id,
          dispute_id: e.disputeId,
          submitted_by: e.submittedBy,
          submitter: {
            id: e.submitter.id,
            email: e.submitter.email,
            username: e.submitter.username,
          },
          party,
          type: e.type,
          description: e.description,
          storage_key: e.storageKey,
          mime_type: e.mimeType,
          size_bytes: e.sizeBytes,
          download_url: downloadUrl,
          created_at: e.createdAt.toISOString(),
        };
      })
    );

    // Count evidence by party
    const workerEvidenceCount = dispute.evidence.filter((e: any) => e.submittedBy === dispute.submission.workerId).length;
    const requesterEvidenceCount = dispute.evidence.filter((e: any) => e.submittedBy === dispute.submission.task.requesterId).length;

    res.json({
      evidence: evidenceWithUrls,
      total: dispute.evidence.length,
      by_party: {
        worker: workerEvidenceCount,
        requester: requesterEvidenceCount,
      },
      evidence_deadline: dispute.evidenceDeadline?.toISOString(),
      evidence_deadline_passed: isEvidenceDeadlinePassed(dispute),
      max_per_party: MAX_EVIDENCE_PER_PARTY,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/disputes/:disputeId/evidence/:evidenceId/download - Download evidence file
router.get('/:disputeId/evidence/:evidenceId/download', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;
    const evidenceId = req.params.evidenceId as string;

    const evidenceRaw = await prisma.disputeEvidence.findFirst({
      where: {
        id: evidenceId,
        disputeId,
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
    });

    if (!evidenceRaw) {
      throw new NotFoundError('Evidence');
    }

    const evidence = evidenceRaw as any;

    // Check access - admin, requester, or worker
    const isWorker = evidence.dispute.submission.workerId === req.user!.userId;
    const isRequester = evidence.dispute.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Evidence');
    }

    if (!evidence.storageKey) {
      throw new ValidationError('This evidence has no file attached');
    }

    const provider = getStorageProvider();

    // For local storage, serve file directly
    if (provider instanceof LocalStorageProvider) {
      const fileResult = await downloadFile(evidence.storageKey);
      if (!fileResult.success || !fileResult.data) {
        throw new NotFoundError('File');
      }

      res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', fileResult.data.length);
      res.send(fileResult.data);
      return;
    }

    // For S3 storage, redirect to signed URL
    const urlResult = await generateDownloadUrl(evidence.storageKey, {
      expiresIn: 3600, // 1 hour
    });

    if (!urlResult.success || !urlResult.data) {
      throw new NotFoundError('File');
    }

    res.redirect(302, urlResult.data.downloadUrl);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DISPUTE RESOLUTION
// ============================================================================

const ResolveDisputeSchema = z.object({
  resolution_type: z.enum(['accept_pay', 'partial_pay', 'reject_refund', 'strike']),
  worker_payout_percent: z.number().min(0).max(100).optional(),
  comment: z.string().max(1000).optional(),
});

// POST /v1/disputes/:disputeId/resolve - Resolve a dispute (admin only)
router.post('/:disputeId/resolve', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;
    const data = ResolveDisputeSchema.parse(req.body);

    // Validate worker_payout_percent for partial_pay
    if (data.resolution_type === 'partial_pay') {
      if (data.worker_payout_percent === undefined) {
        throw new ValidationError('worker_payout_percent is required for partial_pay resolution');
      }
    }

    const disputeRaw = await prisma.dispute.findUnique({
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

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    const dispute = disputeRaw as any;

    if (dispute.status === 'resolved') {
      throw new ValidationError('Dispute already resolved');
    }

    // Calculate payout amounts based on resolution type
    const bountyAmount = dispute.submission.task.bountyAmount;
    let workerAmount = 0;
    let requesterAmount = 0;

    // Determine new submission status and payout amounts based on resolution
    let submissionStatus: string;
    let splitPercentage: number | null = null;

    switch (data.resolution_type) {
      case 'accept_pay':
        submissionStatus = 'accepted';
        workerAmount = bountyAmount;
        requesterAmount = 0;
        break;
      case 'partial_pay':
        submissionStatus = 'resolved';
        splitPercentage = data.worker_payout_percent!;
        workerAmount = (bountyAmount * splitPercentage) / 100;
        requesterAmount = bountyAmount - workerAmount;
        break;
      case 'reject_refund':
        submissionStatus = 'rejected';
        workerAmount = 0;
        requesterAmount = bountyAmount;
        break;
      case 'strike':
        submissionStatus = 'rejected';
        workerAmount = 0;
        requesterAmount = bountyAmount;
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

    // Update dispute with split percentage
    const updatedDispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'resolved',
        resolutionType: data.resolution_type,
        resolutionComment: data.comment,
        splitPercentage,
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

    const { fee: arbitrationFee, rate: arbitrationRate } = await calculateArbitrationFee(
      dispute.submission.task.bountyAmount
    );

    const feeMetadata = JSON.stringify({
      dispute_id: disputeId,
      fee_type: 'arbitration',
      fee_rate: arbitrationRate,
      resolution_type: data.resolution_type,
      worker_payout_percent: data.worker_payout_percent,
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
      // Split arbitration fee proportionally based on payout
      const workerFeeShare = arbitrationFee * (splitPercentage! / 100);
      const requesterFeeShare = arbitrationFee - workerFeeShare;
      feeEntries.push(
        {
          taskId: dispute.submission.taskId,
          submissionId: dispute.submissionId,
          entryType: 'fee',
          amount: workerFeeShare,
          currency: dispute.submission.task.currency,
          direction: 'debit',
          counterpartyId: dispute.submission.workerId,
          metadata: feeMetadata,
        },
        {
          taskId: dispute.submission.taskId,
          submissionId: dispute.submissionId,
          entryType: 'fee',
          amount: requesterFeeShare,
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

    // Create payout ledger entries
    if (workerAmount > 0) {
      await prisma.ledgerEntry.create({
        data: {
          taskId: dispute.submission.taskId,
          submissionId: dispute.submissionId,
          entryType: 'release',
          amount: workerAmount,
          currency: dispute.submission.task.currency,
          direction: 'debit',
          counterpartyId: dispute.submission.workerId,
          metadata: JSON.stringify({
            dispute_id: disputeId,
            resolution_type: data.resolution_type,
            split_percentage: splitPercentage,
          }),
        },
      });
    }

    if (requesterAmount > 0) {
      await prisma.ledgerEntry.create({
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
            resolution_type: data.resolution_type,
            split_percentage: splitPercentage,
          }),
        },
      });
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
          split_percentage: splitPercentage,
          worker_amount: workerAmount,
          requester_amount: requesterAmount,
        }),
      },
    });

    // Create dispute audit log entry
    await prisma.disputeAuditLog.create({
      data: {
        disputeId,
        action: 'resolved',
        actorId: req.user!.userId,
        detailsJson: JSON.stringify({
          resolution_type: data.resolution_type,
          split_percentage: splitPercentage,
          worker_amount: workerAmount,
          requester_amount: requesterAmount,
          comment: data.comment,
        }),
      },
    });

    // Handle stake based on resolution type
    // Get requester wallet for slash recipient
    const requesterWallet = await prisma.walletLink.findFirst({
      where: { userId: dispute.submission.task.requesterId, isPrimary: true },
    });
    const requesterAddress = requesterWallet?.walletAddress || '';

    let stakeResult;
    switch (data.resolution_type) {
      case 'accept_pay':
        // Worker wins dispute - release stake
        stakeResult = await releaseTaskStake(dispute.submission.taskId, dispute.submission.workerId);
        if (!stakeResult.success) {
          console.error(`Stake release failed for dispute ${disputeId}: ${stakeResult.error}`);
        }
        break;
      case 'reject_refund':
      case 'strike':
        // Worker loses dispute - slash stake (50% to requester, 50% to platform)
        stakeResult = await slashTaskStake(
          dispute.submission.taskId,
          dispute.submission.workerId,
          requesterAddress,
          data.resolution_type === 'strike' ? 'dispute_loss_strike' : 'dispute_loss',
          5000 // 50% to requester
        );
        if (!stakeResult.success) {
          console.error(`Stake slash failed for dispute ${disputeId}: ${stakeResult.error}`);
        }
        break;
      case 'partial_pay':
        // Partial resolution - partial slash based on payout percentage
        // Worker return = their payout percentage, rest split between requester and platform
        const workerReturnBps = (splitPercentage || 0) * 100; // Convert percentage to basis points
        const requesterShareBps = Math.floor((10000 - workerReturnBps) / 2); // Half of remainder to requester
        stakeResult = await stakingProvider.partialSlash(
          dispute.submission.taskId,
          dispute.submission.workerId,
          requesterAddress,
          workerReturnBps,
          requesterShareBps
        );
        if (!stakeResult.success) {
          console.error(`Partial stake slash failed for dispute ${disputeId}: ${stakeResult.error}`);
        }
        break;
    }

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

    // Dispatch webhook events to both parties
    const webhookPayload = {
      dispute_id: disputeId,
      submission_id: dispute.submissionId,
      task_id: dispute.submission.taskId,
      task_title: taskTitle,
      resolution_type: data.resolution_type,
      split_percentage: splitPercentage,
      worker_amount: workerAmount,
      requester_amount: requesterAmount,
      bounty_total: bountyAmount,
      resolved_by: req.user!.userId,
      resolved_at: updatedDispute.resolvedAt?.toISOString(),
    };

    await dispatchWebhookEvent('dispute.resolved', webhookPayload, dispute.submission.workerId);
    await dispatchWebhookEvent('dispute.resolved', webhookPayload, dispute.submission.task.requesterId);

    res.json({
      dispute_id: updatedDispute.id,
      status: updatedDispute.status,
      resolution_type: updatedDispute.resolutionType,
      split_percentage: updatedDispute.splitPercentage,
      resolved_at: updatedDispute.resolvedAt?.toISOString(),
      amounts: {
        worker: workerAmount,
        requester: requesterAmount,
        bounty_total: bountyAmount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// MULTI-TIER DISPUTE RESOLUTION
// ============================================================================

// POST /v1/disputes/:disputeId/start-tier1 - Start Tier 1 auto-scoring (admin only or triggered by evidence deadline)
router.post('/:disputeId/start-tier1', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    const dispute = disputeRaw as any;

    // Check access - admin, requester, or worker (any party can trigger)
    const isWorker = dispute.submission.workerId === req.user!.userId;
    const isRequester = dispute.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Dispute');
    }

    // Can only start tier 1 if evidence deadline has passed and not already processed
    if (!isEvidenceDeadlinePassed(dispute) && !isAdmin) {
      throw new ValidationError('Cannot start Tier 1 review until evidence deadline has passed');
    }

    if (dispute.currentTier !== 1) {
      throw new ValidationError(`Dispute is already at Tier ${dispute.currentTier}`);
    }

    if (dispute.autoScoreResult) {
      throw new ValidationError('Tier 1 auto-scoring has already been completed');
    }

    // Run auto-scoring
    const result = await runTier1AutoScore(disputeId);

    // Update status
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'tier1_review' },
    });

    res.json({
      dispute_id: disputeId,
      tier: 1,
      auto_score_result: result,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/disputes/:disputeId/process-tier1 - Process Tier 1 result (auto-resolve or escalate)
router.post('/:disputeId/process-tier1', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;
    const { override_escalate } = z.object({
      override_escalate: z.boolean().optional(), // Admin can force escalation
    }).parse(req.body);

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    const dispute = disputeRaw as any;
    if (dispute.currentTier !== 1) {
      throw new ValidationError(`Dispute is at Tier ${dispute.currentTier}, not Tier 1`);
    }

    if (override_escalate) {
      // Admin forces escalation to Tier 2
      await escalateToTier2(disputeId, 'Admin escalated dispute to community jury');
      const updatedDispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
      res.json({
        dispute_id: disputeId,
        tier: 2,
        status: updatedDispute?.status,
        message: 'Dispute escalated to Tier 2 (Community Jury)',
      });
    } else {
      // Process normally based on auto-score
      await processTier1Result(disputeId);
      const updatedDispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
      res.json({
        dispute_id: disputeId,
        tier: (updatedDispute as any)?.currentTier,
        status: updatedDispute?.status,
        resolution_type: updatedDispute?.resolutionType,
      });
    }
  } catch (error) {
    next(error);
  }
});

// POST /v1/disputes/:disputeId/vote - Jury member casts vote (Tier 2)
router.post('/:disputeId/vote', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;
    const { vote, reason } = z.object({
      vote: z.enum(['worker', 'requester', 'abstain']),
      reason: z.string().max(1000).optional(),
    }).parse(req.body);

    await castJuryVote(disputeId, req.user!.userId, vote, reason);

    res.json({
      dispute_id: disputeId,
      vote,
      message: 'Vote recorded successfully',
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/disputes/:disputeId/escalate - Escalate dispute to next tier
router.post('/:disputeId/escalate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;
    const { appeal_stake } = z.object({
      appeal_stake: z.number().positive().optional(), // Required for Tier 3 escalation
    }).parse(req.body);

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    const dispute = disputeRaw as any;

    // Check access - only parties to the dispute can escalate
    const isWorker = dispute.submission.workerId === req.user!.userId;
    const isRequester = dispute.submission.task.requesterId === req.user!.userId;

    if (!isWorker && !isRequester) {
      throw new ForbiddenError('Only parties to the dispute can escalate');
    }

    if (dispute.currentTier === 1) {
      // Escalate to Tier 2 (anyone can request after evidence deadline)
      if (!isEvidenceDeadlinePassed(dispute)) {
        throw new ValidationError('Cannot escalate until evidence deadline has passed');
      }
      await escalateToTier2(disputeId, 'Party requested escalation to community jury');
    } else if (dispute.currentTier === 2 && dispute.status === 'resolved') {
      // Escalate to Tier 3 (appeal) - requires stake
      if (!appeal_stake) {
        throw new ValidationError('Appeal stake is required for Tier 3 escalation');
      }
      await escalateToTier3(disputeId, req.user!.userId, appeal_stake);
    } else {
      throw new ValidationError(`Cannot escalate dispute in current state (Tier ${dispute.currentTier}, Status: ${dispute.status})`);
    }

    const updatedDispute = await prisma.dispute.findUnique({ where: { id: disputeId } }) as any;

    res.json({
      dispute_id: disputeId,
      tier: updatedDispute?.currentTier,
      status: updatedDispute?.status,
      tier2_deadline: updatedDispute?.tier2Deadline?.toISOString(),
      tier3_deadline: updatedDispute?.tier3Deadline?.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/disputes/:disputeId/jury-status - Get current jury votes and deadlines
router.get('/:disputeId/jury-status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
          },
        },
        jurors: {
          include: {
            juror: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    const dispute = disputeRaw as any;

    // Check access - admin, requester, worker, or juror
    const isWorker = dispute.submission.workerId === req.user!.userId;
    const isRequester = dispute.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';
    const jurors = dispute.jurors || [];
    const isJuror = jurors.some((j: any) => j.jurorId === req.user!.userId);

    if (!isWorker && !isRequester && !isAdmin && !isJuror) {
      throw new NotFoundError('Dispute');
    }

    const juryStatus = await getJuryStatus(disputeId);

    // Include user's vote status if they are a juror
    const userJurorRecord = jurors.find((j: any) => j.jurorId === req.user!.userId);

    res.json({
      ...juryStatus,
      current_tier: dispute.currentTier,
      status: dispute.status,
      tier2_deadline: dispute.tier2Deadline?.toISOString(),
      user_is_juror: !!userJurorRecord,
      user_has_voted: userJurorRecord?.vote !== null,
      user_vote: userJurorRecord?.vote,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/disputes/:disputeId/admin-appeal - Admin resolves Tier 3 appeal
router.post('/:disputeId/admin-appeal', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;
    const { reverse_decision, reason } = z.object({
      reverse_decision: z.boolean(),
      reason: z.string().min(20).max(2000),
    }).parse(req.body);

    await resolveAdminAppeal(disputeId, req.user!.userId, reverse_decision, reason);

    const updatedDispute = await prisma.dispute.findUnique({ where: { id: disputeId } });

    res.json({
      dispute_id: disputeId,
      tier: 3,
      status: updatedDispute?.status,
      resolution_type: updatedDispute?.resolutionType,
      resolution_comment: updatedDispute?.resolutionComment,
      decision_reversed: reverse_decision,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/disputes/:disputeId/tier-history - Get tier transition history
router.get('/:disputeId/tier-history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.disputeId as string;

    const disputeRaw = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        submission: {
          include: {
            task: true,
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!disputeRaw) {
      throw new NotFoundError('Dispute');
    }

    const dispute = disputeRaw as any;

    // Check access - admin, requester, or worker
    const isWorker = dispute.submission.workerId === req.user!.userId;
    const isRequester = dispute.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Dispute');
    }

    res.json({
      dispute_id: disputeId,
      current_tier: dispute.currentTier,
      status: dispute.status,
      tier_history: dispute.tierHistory || [],
      auto_score_result: dispute.autoScoreResult,
      tier1_deadline: dispute.tier1Deadline?.toISOString(),
      tier2_deadline: dispute.tier2Deadline?.toISOString(),
      tier3_deadline: dispute.tier3Deadline?.toISOString(),
      escalation_stake: dispute.escalationStake,
      audit_log: dispute.auditLogs.map((l: any) => ({
        id: l.id,
        action: l.action,
        actor_id: l.actorId,
        details: l.detailsJson,
        created_at: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
