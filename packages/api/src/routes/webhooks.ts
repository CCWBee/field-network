import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createHash, createHmac } from 'crypto';
import { prisma } from '../services/database';
import { authenticate, requireScope } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { safeUrl, WebhookEventTypesSchema, safeJsonParse } from '../utils/validation';

const router = Router();

const WebhookEventTypes = [
  'task.published',
  'task.claimed',
  'task.submitted',
  'task.accepted',
  'task.cancelled',
  'task.expired',
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
        eventTypes: safeJsonParse(w.eventTypes, WebhookEventTypesSchema, []),
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
      event_types: safeJsonParse(webhook.eventTypes, WebhookEventTypesSchema, []),
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
      where: { id: req.params.webhookId },
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

// Helper to dispatch webhook events (used by other services)
export async function dispatchWebhookEvent(
  eventType: typeof WebhookEventTypes[number],
  payload: Record<string, any>,
  userId?: string
) {
  const whereClause: any = {
    status: 'active',
    eventTypes: { contains: eventType },
  };

  if (userId) {
    whereClause.userId = userId;
  }

  const webhooks = await prisma.webhook.findMany({ where: whereClause });

  for (const webhook of webhooks) {
    // Queue delivery (in production, use a proper job queue)
    try {
      await deliverWebhook(webhook, eventType, payload);
    } catch (error) {
      console.error(`Webhook delivery failed for ${webhook.id}:`, error);
    }
  }
}

async function deliverWebhook(
  webhook: { id: string; url: string; secretHash: string },
  eventType: string,
  payload: Record<string, any>
) {
  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  // Sign the payload
  const signature = createHmac('sha256', webhook.secretHash)
    .update(body)
    .digest('hex');

  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event': eventType,
    },
    body,
  });

  // Record delivery
  await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      eventType,
      attempt: 1,
      status: response.ok ? 'success' : 'failed',
      responseCode: response.status,
      lastAttemptAt: new Date(),
    },
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}`);
  }
}

export default router;
