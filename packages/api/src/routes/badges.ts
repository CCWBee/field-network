import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /v1/badges - List badge definitions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const definitions = await prisma.badgeDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    res.json({
      badges: definitions.map((badge) => ({
        type: badge.type,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        icon_url: badge.iconUrl,
        tiers: typeof badge.tiers === 'string' ? JSON.parse(badge.tiers) : badge.tiers,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/badges/me - List earned badges for current user
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const earned = await prisma.userBadge.findMany({
      where: { userId: req.user!.userId },
      orderBy: { earnedAt: 'desc' },
    });

    res.json({
      badges: earned.map((badge) => ({
        badge_type: badge.badgeType,
        tier: badge.tier,
        title: badge.title,
        description: badge.description,
        icon_url: badge.iconUrl,
        earned_at: badge.earnedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
