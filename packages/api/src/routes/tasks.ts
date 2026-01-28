import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database';
import { fundTaskEscrow, refundEscrow } from '../services/escrow';
import { recalculateUserStats } from '../services/reputation';
import { authenticate, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError, StateTransitionError } from '../middleware/errorHandler';
import { TaskStatus, TASK_TRANSITIONS } from '../types/stateMachine';

const router = Router();

// Task schema based on geo_photo_v1 template
const LocationSchema = z.object({
  type: z.enum(['point', 'polygon']),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  coordinates: z.array(z.array(z.number())).optional(),
  radius_m: z.number().min(1).max(50000),
});

const TimeWindowSchema = z.object({
  start_iso: z.string().datetime(),
  end_iso: z.string().datetime(),
});

const PhotoRequirementsSchema = z.object({
  count: z.number().min(1).max(20),
  min_width_px: z.number().min(100).optional(),
  min_height_px: z.number().min(100).optional(),
  format_allow: z.array(z.string()).optional(),
  no_filters: z.boolean().optional(),
});

const BearingSchema = z.object({
  required: z.boolean(),
  target_deg: z.number().min(0).max(360).optional(),
  tolerance_deg: z.number().min(1).max(180).optional(),
});

const CreateTaskSchema = z.object({
  template: z.string().default('geo_photo_v1'),
  title: z.string().min(5).max(200),
  instructions: z.string().min(10).max(2000),
  location: LocationSchema,
  time_window: TimeWindowSchema,
  requirements: z.object({
    photos: PhotoRequirementsSchema,
    bearing: BearingSchema.optional(),
    freshness: z.object({
      must_be_captured_within_task_window: z.boolean(),
    }).optional(),
  }),
  assurance: z.object({
    mode: z.enum(['single', 'quorum']),
    quorum: z.number().min(2).max(5).nullable().optional(),
  }),
  bounty: z.object({
    currency: z.string().length(3),
    amount: z.number().min(1),
  }),
  rights: z.object({
    exclusivity_days: z.number().min(0).max(365),
    allow_resale_after_exclusivity: z.boolean(),
  }),
  policy: z.object({
    safety_notes: z.string().optional(),
  }).optional(),
});

// GET /v1/tasks - List tasks with filters
router.get('/', authenticate, requireScope('tasks:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, template, near_lat, near_lon, max_distance, min_bounty, limit = 50, cursor } = req.query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (template) {
      where.template = template;
    }

    if (min_bounty) {
      where.bountyAmount = { gte: parseFloat(min_bounty as string) };
    }

    // Show posted tasks for browsing, or user's own tasks
    // Users can do both - filter by query param
    if (req.query.mine === 'true') {
      where.requesterId = req.user!.userId;
    } else if (!status) {
      // Default to showing posted tasks when browsing
      where.status = 'posted';
    }

    const tasks = await prisma.task.findMany({
      where,
      take: Math.min(parseInt(limit as string) || 50, 100),
      cursor: cursor ? { id: cursor as string } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        claims: {
          where: { status: 'active' },
          select: { id: true, workerId: true },
        },
      },
    });

    res.json({
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        template: task.template,
        status: task.status,
        location: {
          lat: task.locationLat,
          lon: task.locationLon,
          radius_m: task.radiusM,
        },
        time_window: {
          start_iso: task.timeStart.toISOString(),
          end_iso: task.timeEnd.toISOString(),
        },
        bounty: {
          currency: task.currency,
          amount: task.bountyAmount,
        },
        created_at: task.createdAt.toISOString(),
        is_claimed: task.claims.length > 0,
      })),
      next_cursor: tasks.length > 0 ? tasks[tasks.length - 1].id : null,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/tasks/:taskId - Get single task
router.get('/:taskId', authenticate, requireScope('tasks:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: {
        claims: true,
        submissions: {
          include: {
            artefacts: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    res.json({
      id: task.id,
      requester_id: task.requesterId,
      template: task.template,
      schema_version: task.schemaVersion,
      title: task.title,
      instructions: task.instructions,
      status: task.status,
      location: {
        type: 'point',
        lat: task.locationLat,
        lon: task.locationLon,
        radius_m: task.radiusM,
      },
      time_window: {
        start_iso: task.timeStart.toISOString(),
        end_iso: task.timeEnd.toISOString(),
      },
      requirements: JSON.parse(task.requirementsJson),
      assurance: {
        mode: task.assuranceMode,
        quorum: task.quorumN,
      },
      bounty: {
        currency: task.currency,
        amount: task.bountyAmount,
      },
      rights: {
        exclusivity_days: task.rightsExclusivityDays,
        allow_resale_after_exclusivity: task.rightsResaleAllowed,
      },
      policy: task.policyJson ? JSON.parse(task.policyJson) : null,
      created_at: task.createdAt.toISOString(),
      published_at: task.publishedAt?.toISOString(),
      expires_at: task.expiresAt?.toISOString(),
      claims: task.claims,
      submissions: task.submissions,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/tasks - Create draft task
router.post('/', authenticate, requireScope('tasks:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateTaskSchema.parse(req.body);

    const task = await prisma.task.create({
      data: {
        requesterId: req.user!.userId,
        template: data.template,
        schemaVersion: '1.0',
        title: data.title,
        instructions: data.instructions,
        status: 'draft',
        locationLat: data.location.lat!,
        locationLon: data.location.lon!,
        radiusM: data.location.radius_m,
        timeStart: new Date(data.time_window.start_iso),
        timeEnd: new Date(data.time_window.end_iso),
        requirementsJson: JSON.stringify(data.requirements),
        assuranceMode: data.assurance.mode,
        quorumN: data.assurance.quorum,
        bountyAmount: data.bounty.amount,
        currency: data.bounty.currency,
        rightsExclusivityDays: data.rights.exclusivity_days,
        rightsResaleAllowed: data.rights.allow_resale_after_exclusivity,
        policyJson: data.policy ? JSON.stringify(data.policy) : null,
      },
    });

    // Audit log
    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'task.created',
        objectType: 'task',
        objectId: task.id,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ template: data.template }),
      },
    });

    res.status(201).json({
      id: task.id,
      status: task.status,
      created_at: task.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/tasks/:taskId/publish - Publish draft task
router.post('/:taskId/publish', authenticate, requireScope('tasks:publish'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    if (task.requesterId !== req.user!.userId && req.user!.role !== 'admin') {
      throw new NotFoundError('Task');
    }

    if (!canTransition(task.status as TaskStatus, 'posted')) {
      throw new StateTransitionError(task.status, 'posted', 'task');
    }

    // Fund escrow
    const escrowResult = await fundTaskEscrow(
      task.id,
      task.bountyAmount,
      task.currency,
      req.user!.userId
    );

    if (!escrowResult.success) {
      throw new ValidationError(`Escrow funding failed: ${escrowResult.error}`);
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'posted',
        publishedAt: new Date(),
        expiresAt: task.timeEnd,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'task.published',
        objectType: 'task',
        objectId: task.id,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: '{}',
      },
    });

    await recalculateUserStats(req.user!.userId);

    res.json({
      id: updatedTask.id,
      status: updatedTask.status,
      published_at: updatedTask.publishedAt?.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/tasks/:taskId/cancel - Cancel task
router.post('/:taskId/cancel', authenticate, requireScope('tasks:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
    });

    if (!task) {
      throw new NotFoundError('Task');
    }

    if (task.requesterId !== req.user!.userId && req.user!.role !== 'admin') {
      throw new NotFoundError('Task');
    }

    if (!canTransition(task.status as TaskStatus, 'cancelled')) {
      throw new StateTransitionError(task.status, 'cancelled', 'task');
    }

    // Refund escrow if task was funded
    if (task.status === 'posted' || task.status === 'claimed') {
      const refundResult = await refundEscrow(task.id);
      if (!refundResult.success) {
        throw new ValidationError(`Escrow refund failed: ${refundResult.error}`);
      }
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'cancelled' },
    });

    await prisma.auditEvent.create({
      data: {
        actorId: req.user!.userId,
        action: 'task.cancelled',
        objectType: 'task',
        objectId: task.id,
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        detailsJson: JSON.stringify({ reason: req.body.reason }),
      },
    });

    res.json({
      id: updatedTask.id,
      status: updatedTask.status,
    });
  } catch (error) {
    next(error);
  }
});

function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export default router;
