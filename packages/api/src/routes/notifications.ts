import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getNotificationPrefs,
  updateNotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  NotificationType,
} from '../services/notifications';

const router = Router();

// GET /v1/notifications - List notifications
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = '20', offset = '0', unread_only } = req.query;

    const result = await getNotifications(req.user!.userId, {
      limit: Math.min(parseInt(limit as string) || 20, 100),
      offset: parseInt(offset as string) || 0,
      unreadOnly: unread_only === 'true',
    });

    res.json({
      notifications: result.notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        read: n.read,
        created_at: n.createdAt.toISOString(),
      })),
      total: result.total,
      unread_count: result.unreadCount,
      limit: parseInt(limit as string) || 20,
      offset: parseInt(offset as string) || 0,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/notifications/unread-count - Get unread count only
router.get('/unread-count', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await getUnreadCount(req.user!.userId);
    res.json({ unread_count: count });
  } catch (error) {
    next(error);
  }
});

// POST /v1/notifications/:id/read - Mark single notification as read
router.post('/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const success = await markAsRead(id as string, req.user!.userId);
    if (!success) {
      throw new NotFoundError('Notification');
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/notifications/read-all - Mark all notifications as read
router.post('/read-all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await markAllAsRead(req.user!.userId);
    res.json({
      message: 'All notifications marked as read',
      count,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/notifications/preferences - Get notification preferences
router.get('/preferences', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prefs = await getNotificationPrefs(req.user!.userId);

    res.json({
      preferences: prefs,
      available_types: Object.keys(DEFAULT_NOTIFICATION_PREFS),
    });
  } catch (error) {
    next(error);
  }
});

// PUT /v1/notifications/preferences - Update notification preferences
const UpdatePrefsSchema = z.object({
  task_claimed: z.boolean().optional(),
  submission_received: z.boolean().optional(),
  submission_accepted: z.boolean().optional(),
  submission_rejected: z.boolean().optional(),
  dispute_opened: z.boolean().optional(),
  dispute_resolved: z.boolean().optional(),
  badge_earned: z.boolean().optional(),
  streak_milestone: z.boolean().optional(),
  claim_expiring: z.boolean().optional(),
  fee_tier_upgrade: z.boolean().optional(),
});

router.put('/preferences', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = UpdatePrefsSchema.parse(req.body);

    // Filter to only include defined values
    const updates: Partial<Record<NotificationType, boolean>> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updates[key as NotificationType] = value;
      }
    }

    const prefs = await updateNotificationPrefs(req.user!.userId, updates);

    res.json({
      preferences: prefs,
      message: 'Notification preferences updated',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
