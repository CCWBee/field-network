/**
 * Artefact Routes
 *
 * Handles artefact downloads and metadata retrieval.
 * Supports signed URL redirects for S3 storage.
 */

import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { prisma } from '../services/database';
import {
  getStorageProvider,
  generateDownloadUrl,
  downloadFile,
  LocalStorageProvider,
} from '../services/storage';
import { authenticate } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /v1/artefacts/:artefactId - Get artefact metadata
 *
 * Returns artefact details without the file content.
 */
router.get('/:artefactId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artefactId = req.params.artefactId as string;

    const artefact = await prisma.artefact.findUnique({
      where: { id: artefactId },
      include: {
        submission: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!artefact) {
      throw new NotFoundError('Artefact');
    }

    // Check access - worker, requester, or admin
    const isWorker = artefact.submission.workerId === req.user!.userId;
    const isRequester = artefact.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Artefact');
    }

    res.json({
      id: artefact.id,
      type: artefact.type,
      sha256: artefact.sha256,
      size_bytes: artefact.sizeBytes,
      dimensions: {
        width: artefact.widthPx,
        height: artefact.heightPx,
      },
      location: artefact.gpsLat && artefact.gpsLon ? {
        lat: artefact.gpsLat,
        lon: artefact.gpsLon,
        bearing_deg: artefact.bearingDeg,
      } : null,
      captured_at: artefact.capturedAt?.toISOString(),
      created_at: artefact.createdAt.toISOString(),
      submission_id: artefact.submissionId,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/artefacts/:artefactId/download - Download artefact file
 *
 * For local storage: serves the file directly
 * For S3 storage: redirects to a signed download URL
 */
router.get('/:artefactId/download', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artefactId = req.params.artefactId as string;

    const artefact = await prisma.artefact.findUnique({
      where: { id: artefactId },
      include: {
        submission: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!artefact) {
      throw new NotFoundError('Artefact');
    }

    // Check access - worker, requester, or admin
    const isWorker = artefact.submission.workerId === req.user!.userId;
    const isRequester = artefact.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Artefact');
    }

    const provider = getStorageProvider();

    // Determine filename for Content-Disposition
    const filename = path.basename(artefact.storageKey);

    // For local storage, serve file directly
    if (provider instanceof LocalStorageProvider) {
      const fileResult = await downloadFile(artefact.storageKey);
      if (!fileResult.success || !fileResult.data) {
        throw new NotFoundError('File');
      }

      // Determine content type from extension
      const ext = path.extname(artefact.storageKey).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileResult.data.length);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.send(fileResult.data);
      return;
    }

    // For S3 storage, redirect to signed URL
    const urlResult = await generateDownloadUrl(artefact.storageKey, {
      expiresIn: 3600, // 1 hour
      downloadFilename: filename,
    });

    if (!urlResult.success || !urlResult.data) {
      throw new NotFoundError('File');
    }

    // Return 302 redirect to signed URL
    res.redirect(302, urlResult.data.downloadUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/artefacts/:artefactId/url - Get signed download URL
 *
 * Returns a temporary signed URL for direct file access.
 * Useful for embedding images or client-side downloads.
 */
router.get('/:artefactId/url', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const artefactId = req.params.artefactId as string;
    const expiresIn = Math.min(
      parseInt(req.query.expires_in as string) || 3600,
      86400 // Max 24 hours
    );

    const artefact = await prisma.artefact.findUnique({
      where: { id: artefactId },
      include: {
        submission: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!artefact) {
      throw new NotFoundError('Artefact');
    }

    // Check access - worker, requester, or admin
    const isWorker = artefact.submission.workerId === req.user!.userId;
    const isRequester = artefact.submission.task.requesterId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    if (!isWorker && !isRequester && !isAdmin) {
      throw new NotFoundError('Artefact');
    }

    const urlResult = await generateDownloadUrl(artefact.storageKey, {
      expiresIn,
    });

    if (!urlResult.success || !urlResult.data) {
      throw new NotFoundError('File');
    }

    res.json({
      url: urlResult.data.downloadUrl,
      expires_at: urlResult.data.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
