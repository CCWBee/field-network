import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { prisma } from '../services/database';
import { authenticate, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { safeUrl, WebhookEventTypesSchema, safeJsonParse } from '../utils/validation';

const router = Router();

// Webhook event types - keep in sync with jobs/webhook-delivery.ts
const WebhookEventTypes = [
  'task.published',
  'task.claimed',
  'task.completed',
  'task.cancelled',
  'task.expired',
  'submission.created',
  'submission.finalised',
  'submission.accepted',
  'submission.rejected',
  'dispute.opened',
  'dispute.resolved',
] as const;

const CreateWebhookSchema = z.object({
  url: safeUrl,
  event_types: z.array(z.enum(WebhookEventTypes)),
});

// GET /v1/webhooks - List registered webhooks
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { userId: req.user!.userId },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({
      webhooks: webhooks.map(w => ({
        ...w,
        eventTypes: safeJsonParse(typeof w.eventTypes === 'string' ? w.eventTypes : JSON.stringify(w.eventTypes), WebhookEventTypesSchema, []),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/webhooks - Register a webhook
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateWebhookSchema.parse(req.body);

    // Generate secret for signing
    const secret = createHash('sha256')
      .update(`${req.user!.userId}-${Date.now()}-${Math.random()}`)
      .digest('hex');

    const webhook = await prisma.webhook.create({
      data: {
        userId: req.user!.userId,
        url: data.url,
        secretHash: createHash('sha256').update(secret).digest('hex'),
        eventTypes: JSON.stringify(data.event_types),
        status: 'active',
      },
    });

    res.status(201).json({
      id: webhook.id,
      url: webhook.url,
      event_types: safeJsonParse(typeof webhook.eventTypes === 'string' ? webhook.eventTypes : JSON.stringify(webhook.eventTypes), WebhookEventTypesSchema, []),
      secret, // Only shown once at creation
      status: webhook.status,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/webhooks/:webhookId - Delete a webhook
router.delete('/:webhookId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.webhookId as string },
    });

    if (!webhook || webhook.userId !== req.user!.userId) {
      throw new NotFoundError('Webhook');
    }

    await prisma.webhook.delete({
      where: { id: webhook.id },
    });

    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    next(error);
  }
});

// Note: Webhook dispatching is handled via job queue in ../jobs/webhook-delivery.ts
// Use dispatchWebhookEvent() from there for async delivery with retries

export default router;
