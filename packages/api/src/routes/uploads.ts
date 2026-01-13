import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../services/database';
import { validateUploadToken, consumeUploadToken, saveFile, readFile } from '../services/storage';
import { extractExifData } from '../services/imageProcessor';
import { authenticate } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'));
    }
  },
});

// PUT /v1/uploads/:artefactId - Upload a file
router.put(
  '/:artefactId',
  authenticate,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { artefactId } = req.params;

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
        // Clean up uploaded file
        await fs.unlink(req.file.path).catch(() => {});
        throw new NotFoundError('Artefact');
      }

      // Verify the submission belongs to this worker
      if (artefact.submission.workerId !== req.user!.userId) {
        await fs.unlink(req.file.path).catch(() => {});
        throw new NotFoundError('Artefact');
      }

      // Calculate file hash
      const fileBuffer = await fs.readFile(req.file.path);
      const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

      // Extract EXIF metadata including dimensions, GPS, and bearing
      const exifData = await extractExifData(fileBuffer);

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
          exifJson: exifData.exifJson,
          storageKey: req.file.filename,
          capturedAt: exifData.capturedAt || new Date(),
        },
      });

      res.json({
        artefact_id: artefactId,
        sha256,
        size_bytes: req.file.size,
        storage_key: req.file.filename,
      });
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      next(error);
    }
  }
);

// PUT /v1/uploads/signed/:uploadId - Upload via signed URL
// This endpoint doesn't require auth - the signed token IS the auth
router.put(
  '/signed/:uploadId',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.params;

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

      // Extract EXIF metadata including dimensions, GPS, and bearing
      const exifData = await extractExifData(fileBuffer);

      // Save to storage
      await saveFile(tokenData.key, fileBuffer);

      // Clean up temp file
      await fs.unlink(req.file.path).catch(() => {});

      // Consume the token (one-time use)
      consumeUploadToken(uploadId);

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
            exifJson: exifData.exifJson,
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
      // Clean up file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      next(error);
    }
  }
);

// GET /v1/uploads/:artefactId - Download a file
router.get('/:artefactId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { artefactId } = req.params;

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

    const filePath = path.join(process.cwd(), 'uploads', artefact.storageKey);

    try {
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch {
      throw new NotFoundError('File');
    }
  } catch (error) {
    next(error);
  }
});

export default router;
