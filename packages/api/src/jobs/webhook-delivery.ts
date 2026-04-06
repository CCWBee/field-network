import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import { prisma } from '../services/database';
import { QUEUE_NAMES, registerWorker, addJob } from '../lib/queue';

/**
 * Webhook Delivery Job
 *
 * Handles asynchronous webhook delivery with:
 * - Automatic retries with exponential backoff
 * - Delivery tracking and status recording
 * - Signature verification using HMAC-SHA256
 *
 * Webhook events are queued via addWebhookDeliveryJob() from routes
 * when relevant actions occur.
 */

export interface WebhookDeliveryJobData {
  webhookId: string;
  eventType: string;
  payload: Record<string, any>;
  attempt: number;
  maxAttempts: number;
}

interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attempt: number;
}

// Event types supported by the webhook system
export const WebhookEventTypes = [
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

export type WebhookEventType = (typeof WebhookEventTypes)[number];

/**
 * Deliver a webhook with retry logic
 */
async function deliverWebhook(
  webhook: { id: string; url: string; secretHash: string },
  eventType: string,
  payload: Record<string, any>,
  attempt: number
): Promise<WebhookDeliveryResult> {
  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  // Sign the payload using the webhook's secret
  const signature = createHmac('sha256', webhook.secretHash)
    .update(body)
    .digest('hex');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': eventType,
        'X-Webhook-Delivery': webhook.id,
        'User-Agent': 'FieldNetwork-Webhook/1.0',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Record delivery attempt
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType,
        attempt,
        status: response.ok ? 'success' : 'failed',
        responseCode: response.status,
        lastAttemptAt: new Date(),
      },
    });

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}`,
        attempt,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      attempt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Record failed delivery attempt
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType,
        attempt,
        status: 'failed',
        responseCode: null,
        lastAttemptAt: new Date(),
      },
    });

    return {
      success: false,
      error: errorMessage,
      attempt,
    };
  }
}

/**
 * Process webhook delivery job
 */
async function processWebhookDeliveryJob(job: Job<WebhookDeliveryJobData>): Promise<WebhookDeliveryResult> {
  const { webhookId, eventType, payload, attempt, maxAttempts } = job.data;

  console.log(`Processing webhook delivery job ${job.id}: ${eventType} to webhook ${webhookId} (attempt ${attempt}/${maxAttempts})`);

  // Fetch webhook details
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    console.error(`Webhook ${webhookId} not found`);
    return { success: false, error: 'Webhook not found', attempt };
  }

  // Check if webhook is still active
  if (webhook.status !== 'active') {
    console.log(`Webhook ${webhookId} is not active (status: ${webhook.status}), skipping delivery`);
    return { success: false, error: 'Webhook not active', attempt };
  }

  // Deliver the webhook
  const result = await deliverWebhook(webhook, eventType, payload, attempt);

  if (!result.success && attempt < maxAttempts) {
    // Calculate backoff delay: 1s, 2s, 4s, 8s, 16s, 32s...
    const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 60000); // Cap at 1 minute

    console.log(`Webhook delivery failed, scheduling retry in ${backoffDelay}ms`);

    // Schedule retry
    await addJob<WebhookDeliveryJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      `webhook-retry-${webhookId}-${eventType}`,
      {
        webhookId,
        eventType,
        payload,
        attempt: attempt + 1,
        maxAttempts,
      },
      {
        delay: backoffDelay,
        jobId: `${webhookId}-${eventType}-${Date.now()}-${attempt + 1}`,
      }
    );
  } else if (!result.success) {
    // Max attempts reached, disable webhook if consistently failing
    const recentFailures = await prisma.webhookDelivery.count({
      where: {
        webhookId,
        status: 'failed',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    if (recentFailures >= 10) {
      console.log(`Disabling webhook ${webhookId} due to repeated failures`);
      await prisma.webhook.update({
        where: { id: webhookId },
        data: { status: 'disabled' },
      });
    }
  }

  return result;
}

/**
 * Register the webhook delivery worker
 */
export function registerWebhookDeliveryWorker(): void {
  registerWorker<WebhookDeliveryJobData>(QUEUE_NAMES.WEBHOOK_DELIVERY, processWebhookDeliveryJob, {
    concurrency: 10, // Process up to 10 webhook deliveries concurrently
    limiter: {
      max: 100,
      duration: 60000, // At most 100 deliveries per minute
    },
  });

  console.log('Webhook delivery worker registered');
}

/**
 * Queue a webhook delivery
 */
export async function addWebhookDeliveryJob(
  webhookId: string,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  await addJob<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    `webhook-${webhookId}-${eventType}`,
    {
      webhookId,
      eventType,
      payload,
      attempt: 1,
      maxAttempts: 5, // Up to 5 attempts
    },
    {
      jobId: `${webhookId}-${eventType}-${Date.now()}`,
    }
  );
}

/**
 * Dispatch webhook event to all subscribed webhooks
 * This is the main entry point called from routes
 */
export async function dispatchWebhookEvent(
  eventType: WebhookEventType,
  payload: Record<string, any>,
  userId?: string
): Promise<void> {
  // Build query to find matching webhooks
  const whereClause: any = {
    status: 'active',
  };

  // If userId is provided, only send to that user's webhooks
  if (userId) {
    whereClause.userId = userId;
  }

  // Find webhooks that are subscribed to this event type
  const webhooks = await prisma.webhook.findMany({
    where: whereClause,
    select: {
      id: true,
      eventTypes: true,
    },
  });

  // Filter webhooks by event type subscription
  const matchingWebhooks = webhooks.filter((webhook) => {
    try {
      const eventTypes = webhook.eventTypes as string[];
      return eventTypes.includes(eventType);
    } catch {
      return false;
    }
  });

  console.log(`Dispatching ${eventType} to ${matchingWebhooks.length} webhooks`);

  // Queue delivery for each matching webhook
  for (const webhook of matchingWebhooks) {
    try {
      await addWebhookDeliveryJob(webhook.id, eventType, payload);
    } catch (error) {
      console.error(`Failed to queue webhook delivery for ${webhook.id}:`, error);
    }
  }
}
