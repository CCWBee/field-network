import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { authenticate } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';

const router = Router();

// ============================================================================
// WORKER STATS
// ============================================================================

// GET /v1/users/me/stats/worker - Get detailed worker stats for current user
router.get('/me/stats/worker', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Get user stats
    const userStats = await prisma.userStats.findUnique({
      where: { userId },
    });

    // Get completed tasks with locations for the map
    const completedSubmissions = await prisma.submission.findMany({
      where: {
        workerId: userId,
        status: 'accepted',
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            locationLat: true,
            locationLon: true,
            bountyAmount: true,
            currency: true,
            template: true,
          },
        },
      },
      orderBy: { finalisedAt: 'desc' },
      take: 100, // Limit to last 100 for performance
    });

    // Get earnings history (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const earningsHistory = await prisma.submission.findMany({
      where: {
        workerId: userId,
        status: 'accepted',
        finalisedAt: { gte: twelveMonthsAgo },
      },
      include: {
        task: {
          select: {
            bountyAmount: true,
            currency: true,
          },
        },
      },
      orderBy: { finalisedAt: 'asc' },
    });

    // Group earnings by month
    const monthlyEarnings: Record<string, number> = {};
    earningsHistory.forEach((submission) => {
      if (submission.finalisedAt) {
        const monthKey = `${submission.finalisedAt.getFullYear()}-${String(submission.finalisedAt.getMonth() + 1).padStart(2, '0')}`;
        monthlyEarnings[monthKey] = (monthlyEarnings[monthKey] || 0) + submission.task.bountyAmount;
      }
    });

    // Fill in missing months with 0
    const earningsChart = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'short' });
      earningsChart.push({
        month: monthKey,
        label: monthName,
        amount: monthlyEarnings[monthKey] || 0,
      });
    }

    // Get active claims
    const activeClaims = await prisma.taskClaim.count({
      where: {
        workerId: userId,
        status: 'active',
      },
    });

    // Get pending submissions (finalised but not yet accepted/rejected)
    const pendingSubmissions = await prisma.submission.count({
      where: {
        workerId: userId,
        status: 'finalised',
      },
    });

    // Get recent activity
    const recentActivity = await prisma.submission.findMany({
      where: { workerId: userId },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            bountyAmount: true,
            currency: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    // Calculate average task completion time (in hours)
    const completedWithTimes = await prisma.$queryRaw<{ avg_hours: number }[]>`
      SELECT AVG(
        (julianday(s.finalised_at) - julianday(tc.claimed_at)) * 24
      ) as avg_hours
      FROM submissions s
      JOIN task_claims tc ON s.task_id = tc.task_id AND s.worker_id = tc.worker_id
      WHERE s.worker_id = ${userId}
        AND s.status = 'accepted'
        AND s.finalised_at IS NOT NULL
    `;

    const avgCompletionHours = completedWithTimes[0]?.avg_hours || null;

    // Build completed tasks for map
    const completedTasksMap = completedSubmissions.map((s) => ({
      id: s.task.id,
      title: s.task.title,
      lat: s.task.locationLat,
      lon: s.task.locationLon,
      bounty: {
        amount: s.task.bountyAmount,
        currency: s.task.currency,
      },
      template: s.task.template,
      completed_at: s.finalisedAt?.toISOString() || null,
    }));

    res.json({
      // Summary stats
      summary: {
        tasks_claimed: userStats?.tasksClaimed || 0,
        tasks_delivered: userStats?.tasksDelivered || 0,
        tasks_accepted: userStats?.tasksAccepted || 0,
        tasks_rejected: userStats?.tasksRejected || 0,
        total_earned: userStats?.totalEarned || 0,
        reliability_score: userStats?.reliabilityScore || 100,
        dispute_rate: userStats?.disputeRate || 0,
        current_streak: userStats?.currentStreak || 0,
        longest_streak: userStats?.longestStreak || 0,
        avg_completion_hours: avgCompletionHours ? Math.round(avgCompletionHours * 10) / 10 : null,
      },
      // Live status
      active: {
        claims: activeClaims,
        pending_submissions: pendingSubmissions,
      },
      // Chart data
      earnings_chart: earningsChart,
      // Map data
      completed_tasks: completedTasksMap,
      // Recent activity
      recent_activity: recentActivity.map((a) => ({
        submission_id: a.id,
        task_id: a.task.id,
        task_title: a.task.title,
        bounty: {
          amount: a.task.bountyAmount,
          currency: a.task.currency,
        },
        status: a.status,
        updated_at: a.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// REQUESTER STATS
// ============================================================================

// GET /v1/users/me/stats/requester - Get detailed requester stats for current user
router.get('/me/stats/requester', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    // Get user stats
    const userStats = await prisma.userStats.findUnique({
      where: { userId },
    });

    // Get tasks by status
    const tasksByStatus = await prisma.task.groupBy({
      by: ['status'],
      where: { requesterId: userId },
      _count: true,
    });

    const statusCounts: Record<string, number> = {};
    tasksByStatus.forEach((group) => {
      statusCounts[group.status] = group._count;
    });

    // Get spending history (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const acceptedSubmissions = await prisma.submission.findMany({
      where: {
        task: { requesterId: userId },
        status: 'accepted',
        finalisedAt: { gte: twelveMonthsAgo },
      },
      include: {
        task: {
          select: {
            bountyAmount: true,
            currency: true,
          },
        },
      },
      orderBy: { finalisedAt: 'asc' },
    });

    // Group spending by month
    const monthlySpending: Record<string, number> = {};
    acceptedSubmissions.forEach((submission) => {
      if (submission.finalisedAt) {
        const monthKey = `${submission.finalisedAt.getFullYear()}-${String(submission.finalisedAt.getMonth() + 1).padStart(2, '0')}`;
        monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + submission.task.bountyAmount;
      }
    });

    // Fill in missing months
    const spendingChart = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'short' });
      spendingChart.push({
        month: monthKey,
        label: monthName,
        amount: monthlySpending[monthKey] || 0,
      });
    }

    // Get tasks with locations for map
    const tasksWithLocations = await prisma.task.findMany({
      where: { requesterId: userId },
      select: {
        id: true,
        title: true,
        status: true,
        locationLat: true,
        locationLon: true,
        bountyAmount: true,
        currency: true,
        template: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Get pending reviews
    const pendingReviews = await prisma.submission.findMany({
      where: {
        task: { requesterId: userId },
        status: 'finalised',
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            bountyAmount: true,
            currency: true,
          },
        },
        worker: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { finalisedAt: 'asc' },
    });

    // Calculate fulfillment metrics
    const totalTasksPosted = userStats?.tasksPosted || 0;
    const tasksCompleted = userStats?.tasksCompleted || 0;
    const fulfillmentRate = totalTasksPosted > 0 ? (tasksCompleted / totalTasksPosted) * 100 : 0;

    // Get average response time to submissions
    const avgResponseTime = await prisma.$queryRaw<{ avg_hours: number }[]>`
      SELECT AVG(
        (julianday(d.created_at) - julianday(s.finalised_at)) * 24
      ) as avg_hours
      FROM decisions d
      JOIN submissions s ON d.submission_id = s.id
      JOIN tasks t ON s.task_id = t.id
      WHERE t.requester_id = ${userId}
        AND s.finalised_at IS NOT NULL
    `;

    // Get task templates used
    const templateUsage = await prisma.task.groupBy({
      by: ['template'],
      where: { requesterId: userId },
      _count: true,
      orderBy: { _count: { template: 'desc' } },
    });

    res.json({
      // Summary stats
      summary: {
        tasks_posted: totalTasksPosted,
        tasks_completed: tasksCompleted,
        total_bounties_paid: userStats?.totalBountiesPaid || 0,
        fulfillment_rate: Math.round(fulfillmentRate * 10) / 10,
        avg_response_hours: avgResponseTime[0]?.avg_hours ? Math.round(avgResponseTime[0].avg_hours * 10) / 10 : null,
        repeat_workers: userStats?.repeatCustomers || 0,
      },
      // Task status breakdown
      tasks_by_status: {
        draft: statusCounts['draft'] || 0,
        posted: statusCounts['posted'] || 0,
        claimed: statusCounts['claimed'] || 0,
        submitted: statusCounts['submitted'] || 0,
        accepted: statusCounts['accepted'] || 0,
        disputed: statusCounts['disputed'] || 0,
        cancelled: statusCounts['cancelled'] || 0,
        expired: statusCounts['expired'] || 0,
      },
      // Pending reviews
      pending_reviews: pendingReviews.map((pr) => ({
        submission_id: pr.id,
        task_id: pr.task.id,
        task_title: pr.task.title,
        bounty: {
          amount: pr.task.bountyAmount,
          currency: pr.task.currency,
        },
        worker: {
          id: pr.worker.id,
          username: pr.worker.username,
        },
        submitted_at: pr.finalisedAt?.toISOString() || null,
      })),
      // Chart data
      spending_chart: spendingChart,
      // Map data
      tasks_map: tasksWithLocations.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        lat: t.locationLat,
        lon: t.locationLon,
        bounty: {
          amount: t.bountyAmount,
          currency: t.currency,
        },
        template: t.template,
        created_at: t.createdAt.toISOString(),
      })),
      // Template usage
      template_usage: templateUsage.map((t) => ({
        template: t.template,
        count: t._count,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
