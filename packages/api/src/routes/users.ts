import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database';
import { authenticate, optionalAuth } from '../middleware/auth';
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// ============================================================================
// PUBLIC PROFILE ENDPOINTS
// ============================================================================

// GET /v1/users/:usernameOrId - Get public profile
router.get('/:usernameOrId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usernameOrId = req.params.usernameOrId as string;

    // Try to find by username first, then by ID
    const user = await prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { username: usernameOrId },
              { id: usernameOrId },
            ],
          },
          { status: 'active' },
        ],
      },
      include: {
        stats: true,
        badges: {
          orderBy: { earnedAt: 'desc' },
        },
        workerProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Calculate average rating from reviews
    const avgRating = await prisma.review.aggregate({
      where: { revieweeId: user.id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    // Format location to show only city (not exact address)
    const locationCity = user.location?.split(',')[0]?.trim() || null;

    res.json({
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatarUrl,
      ens_name: user.ensName,
      ens_avatar_url: user.ensAvatarUrl,
      location: locationCity, // Only city, not full location
      website: user.website,
      twitter_handle: user.twitterHandle,
      member_since: user.createdAt.toISOString(),
      // Stats (public portion - no earnings)
      stats: user.stats ? {
        tasks_completed: user.stats.tasksCompleted,
        tasks_posted: user.stats.tasksPosted,
        tasks_accepted: user.stats.tasksAccepted,
        reliability_score: user.stats.reliabilityScore,
        dispute_rate: user.stats.disputeRate,
        current_streak: user.stats.currentStreak,
        longest_streak: user.stats.longestStreak,
        avg_response_time_hours: user.stats.avgResponseTimeHours,
        avg_delivery_time_hours: user.stats.avgDeliveryTimeHours,
        wallet_verified: user.stats.walletVerified,
        identity_verified: user.stats.identityVerified,
      } : null,
      // Rating summary
      rating: {
        average: avgRating._avg.rating ? Math.round(avgRating._avg.rating * 10) / 10 : null,
        count: avgRating._count.rating,
      },
      badges: user.badges.map(b => ({
        badge_type: b.badgeType,
        tier: b.tier,
        title: b.title,
        description: b.description,
        icon_url: b.iconUrl,
        earned_at: b.earnedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/users/:usernameOrId/stats - Get public stats
router.get('/:usernameOrId/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usernameOrId = req.params.usernameOrId as string;

    const user = await prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { username: usernameOrId },
              { id: usernameOrId },
            ],
          },
          { status: 'active' },
        ],
      },
      include: {
        stats: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Get task completion breakdown
    const taskBreakdown = await prisma.submission.groupBy({
      by: ['status'],
      where: { workerId: user.id },
      _count: true,
    });

    const statusCounts: Record<string, number> = {};
    taskBreakdown.forEach(group => {
      statusCounts[group.status] = group._count;
    });

    // Get monthly activity (last 6 months, without amounts)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyActivity = await prisma.submission.findMany({
      where: {
        workerId: user.id,
        status: 'accepted',
        finalisedAt: { gte: sixMonthsAgo },
      },
      select: {
        finalisedAt: true,
      },
    });

    // Group by month (count only, no amounts)
    const activityByMonth: Record<string, number> = {};
    monthlyActivity.forEach(sub => {
      if (sub.finalisedAt) {
        const monthKey = `${sub.finalisedAt.getFullYear()}-${String(sub.finalisedAt.getMonth() + 1).padStart(2, '0')}`;
        activityByMonth[monthKey] = (activityByMonth[monthKey] || 0) + 1;
      }
    });

    // Format activity chart
    const activityChart: { month: string; label: string; tasks_completed: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'short' });
      activityChart.push({
        month: monthKey,
        label: monthName,
        tasks_completed: activityByMonth[monthKey] || 0,
      });
    }

    res.json({
      summary: user.stats ? {
        tasks_completed: user.stats.tasksCompleted,
        tasks_posted: user.stats.tasksPosted,
        tasks_accepted: user.stats.tasksAccepted,
        tasks_rejected: user.stats.tasksRejected,
        reliability_score: user.stats.reliabilityScore,
        dispute_rate: user.stats.disputeRate,
        current_streak: user.stats.currentStreak,
        longest_streak: user.stats.longestStreak,
        avg_response_time_hours: user.stats.avgResponseTimeHours,
        avg_delivery_time_hours: user.stats.avgDeliveryTimeHours,
        // NOT included: total_earned, total_bounties_paid
      } : null,
      submission_breakdown: {
        accepted: statusCounts['accepted'] || 0,
        rejected: statusCounts['rejected'] || 0,
        pending: statusCounts['finalised'] || 0,
        disputed: statusCounts['disputed'] || 0,
      },
      activity_chart: activityChart,
      member_since: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/users/:usernameOrId/badges - Get user's badges
router.get('/:usernameOrId/badges', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usernameOrId = req.params.usernameOrId as string;

    const user = await prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { username: usernameOrId },
              { id: usernameOrId },
            ],
          },
          { status: 'active' },
        ],
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      orderBy: [
        { tier: 'desc' }, // platinum first
        { earnedAt: 'desc' },
      ],
    });

    // Get badge definitions for additional info
    const badgeTypes = [...new Set(badges.map(b => b.badgeType))];
    const definitions = await prisma.badgeDefinition.findMany({
      where: { type: { in: badgeTypes } },
    });

    const definitionMap = new Map(definitions.map(d => [d.type, d]));

    res.json({
      badges: badges.map(b => {
        const def = definitionMap.get(b.badgeType);
        return {
          badge_type: b.badgeType,
          tier: b.tier,
          title: b.title,
          description: b.description,
          icon_url: b.iconUrl || def?.iconUrl,
          category: def?.category || 'achievement',
          earned_at: b.earnedAt.toISOString(),
        };
      }),
      summary: {
        total: badges.length,
        by_tier: {
          platinum: badges.filter(b => b.tier === 'platinum').length,
          gold: badges.filter(b => b.tier === 'gold').length,
          silver: badges.filter(b => b.tier === 'silver').length,
          bronze: badges.filter(b => b.tier === 'bronze').length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/users/:usernameOrId/reviews - Get reviews for a user
router.get('/:usernameOrId/reviews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usernameOrId = req.params.usernameOrId as string;
    const limit = (req.query.limit as string) || '20';
    const offset = (req.query.offset as string) || '0';
    const role = req.query.role as string | undefined;

    const user = await prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { username: usernameOrId },
              { id: usernameOrId },
            ],
          },
          { status: 'active' },
        ],
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Build where clause
    const where: any = { revieweeId: user.id };
    if (role && (role === 'requester' || role === 'worker')) {
      where.role = role;
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string) || 20, 50),
        skip: parseInt(offset as string) || 0,
      }),
      prisma.review.count({ where }),
    ]);

    // Get reviewer info (limited - just username and avatar)
    const reviewerIds = reviews.map(r => r.reviewerId);
    const reviewers = await prisma.user.findMany({
      where: { id: { in: reviewerIds } },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        ensName: true,
        ensAvatarUrl: true,
      },
    });

    const reviewerMap = new Map(reviewers.map(r => [r.id, r]));

    // Get rating breakdown
    const ratingBreakdown = await prisma.review.groupBy({
      by: ['rating'],
      where: { revieweeId: user.id },
      _count: true,
    });

    const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingBreakdown.forEach(group => {
      ratingCounts[group.rating] = group._count;
    });

    // Calculate average
    const avgRating = await prisma.review.aggregate({
      where: { revieweeId: user.id },
      _avg: { rating: true },
    });

    res.json({
      reviews: reviews.map(r => {
        const reviewer = reviewerMap.get(r.reviewerId);
        return {
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          role: r.role, // Was this review from a requester or worker?
          reviewer: reviewer ? {
            username: reviewer.username,
            avatar_url: reviewer.ensAvatarUrl || reviewer.avatarUrl,
          } : null,
          created_at: r.createdAt.toISOString(),
        };
      }),
      summary: {
        average_rating: avgRating._avg.rating ? Math.round(avgRating._avg.rating * 10) / 10 : null,
        total_reviews: total,
        rating_breakdown: ratingCounts,
      },
      total,
      limit: parseInt(limit as string) || 20,
      offset: parseInt(offset as string) || 0,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// REVIEW SUBMISSION
// ============================================================================

const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// POST /v1/users/:usernameOrId/reviews - Submit a review for a user
router.post('/:usernameOrId/reviews', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usernameOrId = req.params.usernameOrId as string;
    const { task_id } = req.body;
    const data = CreateReviewSchema.parse(req.body);
    const reviewerId = req.user!.userId;

    if (!task_id) {
      throw new ValidationError('task_id is required');
    }

    // Find the user being reviewed
    const reviewee = await prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { username: usernameOrId },
              { id: usernameOrId },
            ],
          },
          { status: 'active' },
        ],
      },
    });

    if (!reviewee) {
      throw new NotFoundError('User');
    }

    // Cannot review yourself
    if (reviewee.id === reviewerId) {
      throw new ValidationError('Cannot review yourself');
    }

    // Find the task and verify completion
    const task = await prisma.task.findUnique({
      where: { id: task_id },
      include: {
        submissions: {
          where: { status: 'accepted' },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    if (task.status !== 'accepted') {
      throw new ValidationError('Can only review after task is completed');
    }

    // Determine the reviewer's role and validate they can review
    let reviewerRole: string;

    if (task.requesterId === reviewerId) {
      // Requester reviewing worker
      const acceptedSubmission = task.submissions.find(s => s.workerId === reviewee.id);
      if (!acceptedSubmission) {
        throw new ValidationError('This user did not complete this task');
      }
      reviewerRole = 'requester';
    } else {
      // Worker reviewing requester
      const workerSubmission = task.submissions.find(s => s.workerId === reviewerId);
      if (!workerSubmission) {
        throw new ValidationError('You did not complete this task');
      }
      if (task.requesterId !== reviewee.id) {
        throw new ValidationError('This user did not post this task');
      }
      reviewerRole = 'worker';
    }

    // Check if already reviewed
    const existingReview = await prisma.review.findUnique({
      where: {
        reviewerId_taskId: {
          reviewerId,
          taskId: task_id,
        },
      },
    });

    if (existingReview) {
      throw new ValidationError('You have already reviewed for this task');
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        reviewerId,
        revieweeId: reviewee.id,
        taskId: task_id,
        rating: data.rating,
        comment: data.comment,
        role: reviewerRole,
      },
    });

    res.status(201).json({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      role: review.role,
      created_at: review.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/users/:usernameOrId/can-review/:taskId - Check if current user can review
router.get('/:usernameOrId/can-review/:taskId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usernameOrId = req.params.usernameOrId as string;
    const taskId = req.params.taskId as string;
    const userId = req.user!.userId;

    // Find the user to review
    const reviewee = await prisma.user.findFirst({
      where: {
        AND: [
          {
            OR: [
              { username: usernameOrId },
              { id: usernameOrId },
            ],
          },
          { status: 'active' },
        ],
      },
    });

    if (!reviewee) {
      res.json({ can_review: false, reason: 'User not found' });
      return;
    }

    if (reviewee.id === userId) {
      res.json({ can_review: false, reason: 'Cannot review yourself' });
      return;
    }

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        submissions: {
          where: { status: 'accepted' },
        },
      },
    });

    if (!task) {
      res.json({ can_review: false, reason: 'Task not found' });
      return;
    }

    if (task.status !== 'accepted') {
      res.json({ can_review: false, reason: 'Task not completed' });
      return;
    }

    // Check existing review
    const existingReview = await prisma.review.findUnique({
      where: {
        reviewerId_taskId: {
          reviewerId: userId,
          taskId,
        },
      },
    });

    if (existingReview) {
      res.json({ can_review: false, reason: 'Already reviewed' });
      return;
    }

    // Check if user is involved in the task
    const isRequester = task.requesterId === userId;
    const workerSubmission = task.submissions.find(s => s.workerId === userId);
    const isWorker = !!workerSubmission;

    if (!isRequester && !isWorker) {
      res.json({ can_review: false, reason: 'Not involved in this task' });
      return;
    }

    // Validate reviewer can review this specific user
    if (isRequester) {
      const userDidTask = task.submissions.some(s => s.workerId === reviewee.id);
      if (!userDidTask) {
        res.json({ can_review: false, reason: 'User did not complete this task' });
        return;
      }
    } else {
      if (task.requesterId !== reviewee.id) {
        res.json({ can_review: false, reason: 'User did not post this task' });
        return;
      }
    }

    res.json({
      can_review: true,
      role: isRequester ? 'requester' : 'worker',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
