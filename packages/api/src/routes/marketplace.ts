import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { authenticate } from '../middleware/auth';

const router = Router();

const DEFAULT_RESALE_DELAY_DAYS = 90;
const DEFAULT_ROYALTY_RATE = 0.1;

// GET /v1/marketplace/inventory - List resale-ready data assets
router.get('/inventory', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mine = req.query.mine === 'true';
    const now = new Date();

    const tasks = await prisma.task.findMany({
      where: {
        status: 'accepted',
        ...(mine ? { requesterId: req.user!.userId } : {}),
        rightsResaleAllowed: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const items = tasks.map((task) => {
      const exclusivityDays = task.rightsExclusivityDays || DEFAULT_RESALE_DELAY_DAYS;
      const resaleAvailableAt = new Date(task.updatedAt.getTime() + exclusivityDays * 24 * 60 * 60 * 1000);
      const status = resaleAvailableAt > now ? 'exclusive' : 'resale_ready';

      return {
        task_id: task.id,
        title: task.title,
        location: { lat: task.locationLat, lon: task.locationLon, radius_m: task.radiusM },
        bounty: { currency: task.currency, amount: task.bountyAmount },
        accepted_at: task.updatedAt.toISOString(),
        resale_available_at: resaleAvailableAt.toISOString(),
        status,
        royalty_rate: DEFAULT_ROYALTY_RATE,
      };
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// GET /v1/marketplace/royalties - Collector royalty summary
router.get('/royalties', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Placeholder summary until resale transactions exist.
    res.json({
      total_earned: 0,
      pending: 0,
      last_payout_at: null,
      items: [],
    });
  } catch (error) {
    next(error);
  }
});

export default router;
