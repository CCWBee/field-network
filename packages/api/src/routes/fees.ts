import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireScope } from '../middleware/auth';
import { ValidationError } from '../middleware/errorHandler';
import {
  previewFees,
  getPlatformFeeTiers,
  getUserFeeTier,
  getTierProgress,
  getUserFeeHistory,
  getAllFeeConfigs,
  updateFeeConfig,
  getFeeStatistics,
  seedDefaultFeeConfigs,
} from '../services/fees';

const router = Router();

// GET /v1/fees/preview - Preview fees for a bounty amount
router.get('/preview', authenticate, requireScope('tasks:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const amount = parseFloat(req.query.amount as string);

    if (isNaN(amount) || amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }

    if (amount > 100000) {
      throw new ValidationError('amount exceeds maximum allowed (100000)');
    }

    const preview = await previewFees(req.user!.userId, amount);

    res.json({
      bounty_amount: preview.bounty,
      platform_fee: {
        amount: preview.platformFee,
        rate: preview.platformFeeRate,
        rate_percent: `${(preview.platformFeeRate * 100).toFixed(0)}%`,
        tier: preview.platformFeeTier,
      },
      arbitration_fee: {
        amount: preview.arbitrationFee,
        rate: preview.arbitrationFeeRate,
        rate_percent: `${(preview.arbitrationFeeRate * 100).toFixed(0)}%`,
      },
      total_cost: preview.totalCost,
      worker_payout: preview.workerPayout,
      currency: req.query.currency || 'USDC',
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/fees/tiers - Get all available fee tiers
router.get('/tiers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tiers = await getPlatformFeeTiers();

    res.json({
      tiers: tiers.map(t => ({
        name: t.name,
        rate: t.rate,
        rate_percent: `${(t.rate * 100).toFixed(0)}%`,
        requirements: {
          min_account_days: t.minAccountDays,
          min_tasks_accepted: t.minTasksAccepted,
          min_reliability: t.minReliability,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/fees/my-tier - Get current user's fee tier and progress
router.get('/my-tier', authenticate, requireScope('profile:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const progress = await getTierProgress(req.user!.userId);

    res.json({
      current_tier: {
        name: progress.currentTier.name,
        rate: progress.currentTier.rate,
        rate_percent: `${(progress.currentTier.rate * 100).toFixed(0)}%`,
      },
      next_tier: progress.nextTier ? {
        name: progress.nextTier.name,
        rate: progress.nextTier.rate,
        rate_percent: `${(progress.nextTier.rate * 100).toFixed(0)}%`,
        savings_percent: `${((progress.currentTier.rate - progress.nextTier.rate) * 100).toFixed(0)}%`,
      } : null,
      progress: progress.progress ? {
        account_days: {
          current: progress.progress.accountDays.current,
          required: progress.progress.accountDays.required,
          met: progress.progress.accountDays.met,
        },
        tasks_accepted: {
          current: progress.progress.tasksAccepted.current,
          required: progress.progress.tasksAccepted.required,
          met: progress.progress.tasksAccepted.met,
        },
        reliability: {
          current: progress.progress.reliability.current,
          required: progress.progress.reliability.required,
          met: progress.progress.reliability.met,
        },
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/fees/history - Get user's fee payment history
router.get('/history', authenticate, requireScope('profile:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await getUserFeeHistory(req.user!.userId, { limit, offset });

    res.json({
      entries: history.entries.map(e => ({
        id: e.id,
        task_id: e.taskId,
        fee_type: e.feeType,
        amount: e.amount,
        currency: e.currency,
        created_at: e.createdAt.toISOString(),
      })),
      total: history.total,
      total_fees_paid: history.totalFeesPaid,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// ADMIN ENDPOINTS
// =====================================================

// GET /v1/fees/admin/configs - Get all fee configurations (admin only)
router.get('/admin/configs', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await getAllFeeConfigs();

    res.json({
      configs: configs.map(c => ({
        id: c.id,
        fee_type: c.feeType,
        name: c.name,
        description: c.description,
        tier_order: c.tierOrder,
        rate: c.rate,
        rate_percent: `${(c.rate * 100).toFixed(0)}%`,
        min_fee: c.minFee,
        max_fee: c.maxFee,
        requirements: {
          min_account_days: c.minAccountDays,
          min_tasks_accepted: c.minTasksAccepted,
          min_reliability: c.minReliability,
        },
        is_active: c.isActive,
        created_at: c.createdAt.toISOString(),
        updated_at: c.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /v1/fees/admin/configs/:configId - Update a fee configuration (admin only)
const updateConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  rate: z.number().min(0).max(1).optional(),
  min_fee: z.number().min(0).optional(),
  max_fee: z.number().min(0).optional(),
  min_account_days: z.number().int().min(0).optional(),
  min_tasks_accepted: z.number().int().min(0).optional(),
  min_reliability: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});

router.patch('/admin/configs/:configId', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configId = req.params.configId as string;
    const validation = updateConfigSchema.safeParse(req.body);

    if (!validation.success) {
      throw new ValidationError(validation.error.errors.map(e => e.message).join(', '));
    }

    const data = validation.data;
    const updates: any = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.rate !== undefined) updates.rate = data.rate;
    if (data.min_fee !== undefined) updates.minFee = data.min_fee;
    if (data.max_fee !== undefined) updates.maxFee = data.max_fee;
    if (data.min_account_days !== undefined) updates.minAccountDays = data.min_account_days;
    if (data.min_tasks_accepted !== undefined) updates.minTasksAccepted = data.min_tasks_accepted;
    if (data.min_reliability !== undefined) updates.minReliability = data.min_reliability;
    if (data.is_active !== undefined) updates.isActive = data.is_active;

    const updated = await updateFeeConfig(configId, updates);

    res.json({
      id: updated.id,
      fee_type: updated.feeType,
      name: updated.name,
      rate: updated.rate,
      is_active: updated.isActive,
      updated_at: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/fees/admin/stats - Get fee statistics (admin only)
router.get('/admin/stats', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : undefined;
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : undefined;

    const stats = await getFeeStatistics({ startDate, endDate });

    res.json({
      total_platform_fees: stats.totalPlatformFees,
      total_arbitration_fees: stats.totalArbitrationFees,
      total_fees: stats.totalPlatformFees + stats.totalArbitrationFees,
      fees_by_tier: stats.feesByTier,
      transaction_count: stats.transactionCount,
      period: {
        start: startDate?.toISOString() || null,
        end: endDate?.toISOString() || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/fees/admin/seed - Seed default fee configs (admin only)
router.post('/admin/seed', authenticate, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await seedDefaultFeeConfigs();
    res.json({ message: 'Default fee configurations seeded successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
