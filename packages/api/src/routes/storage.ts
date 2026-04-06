/**
 * Storage Routes
 *
 * Handles storage-related endpoints for signed URL operations.
 * These routes are primarily used by the local storage provider.
 * For S3 storage, uploads/downloads happen directly with S3.
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
  validateUploadToken,
  consumeToken,
  LocalStorageProvider,
} from '../services/storage';
import { extractExifData } from '../services/imageProcessor';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';

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
 * PUT /v1/storage/upload/:uploadId - Signed URL upload endpoint
 *
 * Handles file uploads using signed upload URLs.
 * This endpoint is used by the local storage provider.
 * For S3, clients upload directly to S3 using the signed URL.
 */
router.put(
  '/upload/:uploadId',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uploadId = req.params.uploadId as string;

      // Validate the signed upload token
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

      // Consume the token (one-time use)
      consumeToken(uploadId);

      // Update artefact metadata if it exists
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
 * GET /v1/storage/download/:downloadId - Signed URL download endpoint
 *
 * Handles file downloads using signed download URLs.
 * This endpoint is used by the local storage provider.
 * For S3, clients download directly from S3 using the signed URL.
 */
router.get('/download/:downloadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const downloadId = req.params.downloadId as string;
    const provider = getStorageProvider();

    if (!(provider instanceof LocalStorageProvider)) {
      throw new ValidationError('This endpoint is only available for local storage');
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
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
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

/**
 * GET /v1/storage/health - Storage health check
 *
 * Returns the health status of the configured storage provider.
 */
router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = getStorageProvider();
    const health = await provider.healthCheck();

    res.status(health.healthy ? 200 : 503).json(health);
  } catch (error) {
    next(error);
  }
});

export default router;
