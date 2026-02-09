/**
 * GDPR Routes
 *
 * GET  /v1/users/me/data-export  - Export all user data as JSON
 * DELETE /v1/users/me             - Soft-delete user account (anonymize PII)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { exportUserData, deleteUserData } from '../services/gdpr';

const router = Router();

// GET /v1/users/me/data-export
router.get('/me/data-export', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await exportUserData(req.user!.userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="field-network-data-export-${Date.now()}.json"`);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/users/me
router.delete('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteUserData(req.user!.userId);

    res.json({
      message: 'Account deleted. PII has been anonymized and all tokens revoked.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
