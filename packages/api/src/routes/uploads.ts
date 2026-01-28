/**
 * File Upload Routes
 *
 * Handles file uploads for artefacts using the configured storage provider.
 * Supports both direct uploads and signed URL uploads for client-side uploads.
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { prisma } from '../services/database';
import {
  getStorageProvider,
  uploadFile,
  downloadFile,
  generateDownloadUrl,
  validateUploadToken,
  consumeToken,
  LocalStorageProvider,
} from '../services/storage';
import { extractExifData } from '../services/imageProcessor';
import { authenticate } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';

const router = Router();

// Configure multer for temporary file storage
const tempStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(os.tmpdir(), 'field-network-uploads');
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
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: tempStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
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
 * PUT /v1/uploads/:artefactId - Direct upload to artefact
 *
 * Uploads a file directly to the artefact record.
 * Requires authentication and ownership of the submission.
 */
router.put(
  '/:artefactId',
  authenticate,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const artefactId = req.params.artefactId as string;

      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      // Find the artefact
      const artefact = await prisma.artefact.findUnique({
        where: { id: artefactId },
        include: {
          submission: true,
        },
      });

      if (!artefact) {
        await cleanupTempFile(req.file.path);
        throw new NotFoundError('Artefact');
      }

      // Verify the submission belongs to this worker
      if (artefact.submission.workerId !== req.user!.userId) {
        await cleanupTempFile(req.file.path);
        throw new NotFoundError('Artefact');
      }

      // Read file and calculate hash
      const fileBuffer = await fs.readFile(req.file.path);
      const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

      // Extract EXIF metadata including dimensions, GPS, and bearing
      const exifData = await extractExifData(fileBuffer);

      // Upload to storage provider
      const uploadResult = await uploadFile(
        artefact.storageKey,
        fileBuffer,
        req.file.mimetype
      );

      if (!uploadResult.success) {
        await cleanupTempFile(req.file.path);
        throw new Error(`Storage upload failed: ${uploadResult.error}`);
      }

      // Clean up temp file
      await cleanupTempFile(req.file.path);

      // Update artefact record with extracted metadata
      await prisma.artefact.update({
        where: { id: artefactId },
        data: {
          sha256,
          sizeBytes: req.file.size,
          widthPx: exifData.width,
          heightPx: exifData.height,
          gpsLat: exifData.gpsLat,
          gpsLon: exifData.gpsLon,
          bearingDeg: exifData.bearingDeg,
          exifJson: JSON.stringify(exifData.exifJson),
          capturedAt: exifData.capturedAt || new Date(),
        },
      });

      res.json({
        artefact_id: artefactId,
        sha256,
        size_bytes: req.file.size,
        storage_key: artefact.storageKey,
      });
    } catch (error) {
      await cleanupTempFile(req.file?.path);
      next(error);
    }
  }
);

/**
 * PUT /v1/uploads/signed/:uploadId - Upload via signed URL (local provider only)
 *
 * This endpoint handles uploads when using the local storage provider.
 * For S3 provider, clients upload directly to S3 using the signed URL.
 */
router.put(
  '/signed/:uploadId',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uploadId = req.params.uploadId as string;

      // Validate the signed upload token (local provider only)
      const tokenData = validateUploadToken(uploadId);
      if (!tokenData) {
        throw new ValidationError('Invalid or expired upload token');
      }

      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      // Read file and calculate hash
      const fileBuffer = await fs.readFile(req.file.path);
      const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

      // Extract EXIF metadata including dimensions, GPS, and bearing
      const exifData = await extractExifData(fileBuffer);

      // Upload to storage provider
      const uploadResult = await uploadFile(
        tokenData.key,
        fileBuffer,
        tokenData.contentType
      );

      if (!uploadResult.success) {
        await cleanupTempFile(req.file.path);
        throw new Error(`Storage upload failed: ${uploadResult.error}`);
      }

      // Clean up temp file
      await cleanupTempFile(req.file.path);

      // Consume the token (one-time use)
      consumeToken(uploadId);

      // Find and update the artefact by storage key
      const artefact = await prisma.artefact.findFirst({
        where: { storageKey: tokenData.key },
      });

      if (artefact) {
        await prisma.artefact.update({
          where: { id: artefact.id },
          data: {
            sha256,
            sizeBytes: req.file.size,
            widthPx: exifData.width,
            heightPx: exifData.height,
            gpsLat: exifData.gpsLat,
            gpsLon: exifData.gpsLon,
            bearingDeg: exifData.bearingDeg,
            exifJson: JSON.stringify(exifData.exifJson),
            capturedAt: exifData.capturedAt || new Date(),
          },
        });
      }

      res.json({
        success: true,
        sha256,
        size_bytes: req.file.size,
        storage_key: tokenData.key,
      });
    } catch (error) {
      await cleanupTempFile(req.file?.path);
      next(error);
    }
  }
);

/**
 * POST /v1/storage/upload/:uploadId - Local storage upload endpoint
 *
 * Alternative endpoint for local storage signed URL uploads.
 * Mirrors the signed URL pattern used by S3.
 */
router.put(
  '/storage/upload/:uploadId',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uploadId = req.params.uploadId as string;

      const tokenData = validateUploadToken(uploadId);
      if (!tokenData) {
        throw new ValidationError('Invalid or expired upload token');
      }

      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      const fileBuffer = await fs.readFile(req.file.path);
      const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

      // Extract EXIF metadata
      const exifData = await extractExifData(fileBuffer);

      // Upload to storage
      const uploadResult = await uploadFile(
        tokenData.key,
        fileBuffer,
        tokenData.contentType
      );

      if (!uploadResult.success) {
        await cleanupTempFile(req.file.path);
        throw new Error(`Storage upload failed: ${uploadResult.error}`);
      }

      await cleanupTempFile(req.file.path);
      consumeToken(uploadId);

      // Update artefact metadata
      const artefact = await prisma.artefact.findFirst({
        where: { storageKey: tokenData.key },
      });

      if (artefact) {
        await prisma.artefact.update({
          where: { id: artefact.id },
          data: {
            sha256,
            sizeBytes: req.file.size,
            widthPx: exifData.width,
            heightPx: exifData.height,
            gpsLat: exifData.gpsLat,
            gpsLon: exifData.gpsLon,
            bearingDeg: exifData.bearingDeg,
            exifJson: JSON.stringify(exifData.exifJson),
            capturedAt: exifData.capturedAt || new Date(),
          },
        });
      }

      res.json({
        success: true,
        sha256,
        size_bytes: req.file.size,
        storage_key: tokenData.key,
      });
    } catch (error) {
      await cleanupTempFile(req.file?.path);
      next(error);
    }
  }
);

/**
 * GET /v1/uploads/:artefactId - Download artefact file
 *
 * For local storage: serves the file directly
 * For S3 storage: redirects to a signed download URL
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

    const provider = getStorageProvider();

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
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileResult.data.length);
      res.send(fileResult.data);
      return;
    }

    // For S3 storage, redirect to signed URL
    const urlResult = await generateDownloadUrl(artefact.storageKey, {
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

/**
 * GET /v1/storage/download/:downloadId - Local storage download endpoint
 *
 * Handles downloads for local storage signed URLs.
 */
router.get('/storage/download/:downloadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const downloadId = req.params.downloadId as string;
    const provider = getStorageProvider();

    if (!(provider instanceof LocalStorageProvider)) {
      throw new ValidationError('This endpoint is only for local storage');
    }

    const tokenData = provider.validateDownloadToken(downloadId);
    if (!tokenData) {
      throw new ValidationError('Invalid or expired download token');
    }

    const fileResult = await downloadFile(tokenData.key);
    if (!fileResult.success || !fileResult.data) {
      throw new NotFoundError('File');
    }

    // Determine content type from extension
    const ext = path.extname(tokenData.key).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Handle Content-Disposition for download filename
    const filename = req.query.filename as string;
    if (filename) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileResult.data.length);
    res.send(fileResult.data);
  } catch (error) {
    next(error);
  }
});

export default router;
