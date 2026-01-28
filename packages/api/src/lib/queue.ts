import { Queue, Worker, QueueEvents, Job, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

/**
 * BullMQ Queue Configuration
 *
 * Uses Redis for job persistence and scheduling.
 * Configure via REDIS_URL environment variable.
 *
 * Features:
 * - Persistent job storage
 * - Scheduled/delayed jobs
 * - Automatic retries with exponential backoff
 * - Job prioritization
 * - Progress tracking
 */

// Redis connection options
const getRedisConnection = (): ConnectionOptions => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // Parse URL for connection options
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
  };
};

// Shared Redis connection for better resource usage
let sharedRedisConnection: IORedis | null = null;

export function getRedisClient(): IORedis {
  if (!sharedRedisConnection) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    sharedRedisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return sharedRedisConnection;
}

// Queue names
export const QUEUE_NAMES = {
  CLAIM_EXPIRY: 'claim-expiry',
  NOTIFICATION: 'notification',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  CLEANUP: 'cleanup',
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Queue registry
const queues: Map<string, Queue> = new Map();
const workers: Map<string, Worker> = new Map();
const queueEvents: Map<string, QueueEvents> = new Map();

/**
 * Get or create a queue by name
 */
export function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // Start with 1 second, then 2s, 4s, etc.
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
          age: 24 * 60 * 60, // Remove after 24 hours
        },
        removeOnFail: {
          count: 500, // Keep last 500 failed jobs for debugging
          age: 7 * 24 * 60 * 60, // Remove after 7 days
        },
      },
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

/**
 * Register a worker for a queue
 */
export function registerWorker<T = unknown>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<void>,
  options?: {
    concurrency?: number;
    limiter?: { max: number; duration: number };
  }
): Worker {
  const worker = new Worker(name, processor, {
    connection: getRedisConnection(),
    concurrency: options?.concurrency || 5,
    limiter: options?.limiter,
  });

  // Error handling
  worker.on('error', (error) => {
    console.error(`Worker ${name} error:`, error);
  });

  worker.on('failed', (job, error) => {
    console.error(`Job ${job?.id} in ${name} failed:`, error);
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} in ${name} completed`);
  });

  workers.set(name, worker);
  return worker;
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(name: QueueName): QueueEvents {
  if (!queueEvents.has(name)) {
    const events = new QueueEvents(name, {
      connection: getRedisConnection(),
    });
    queueEvents.set(name, events);
  }
  return queueEvents.get(name)!;
}

/**
 * Add a job to a queue
 */
export async function addJob<T>(
  queueName: QueueName,
  jobName: string,
  data: T,
  options?: {
    delay?: number;
    priority?: number;
    repeat?: {
      pattern?: string; // Cron pattern
      every?: number; // Milliseconds between runs
    };
    jobId?: string;
  }
): Promise<Job<T>> {
  const queue = getQueue(queueName);

  return queue.add(jobName, data, {
    delay: options?.delay,
    priority: options?.priority,
    repeat: options?.repeat,
    jobId: options?.jobId,
  });
}

/**
 * Schedule a repeating job (cron-style or interval)
 */
export async function scheduleRepeatingJob<T>(
  queueName: QueueName,
  jobName: string,
  data: T,
  schedule: {
    pattern?: string; // Cron pattern, e.g., '*/5 * * * *' for every 5 minutes
    every?: number; // Interval in milliseconds
  }
): Promise<Job<T>> {
  const queue = getQueue(queueName);

  // Remove existing repeatable job with same name
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === jobName) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  return queue.add(jobName, data, {
    repeat: schedule,
  });
}

/**
 * Get job queue status for health checks
 */
export async function getJobQueueStatus(): Promise<{
  status: 'connected' | 'error' | 'disabled';
  latencyMs?: number;
  error?: string;
}> {
  // If no Redis URL configured, consider it disabled
  if (!process.env.REDIS_URL) {
    return { status: 'disabled' };
  }

  const startTime = Date.now();

  try {
    const redis = getRedisClient();
    await redis.ping();
    const latencyMs = Date.now() - startTime;

    return {
      status: 'connected',
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}

/**
 * Get counts for all queues (for admin dashboard)
 */
export async function getQueueCounts(): Promise<
  Record<
    string,
    {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }
  >
> {
  const counts: Record<string, {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> = {};

  for (const [name, queue] of queues) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    counts[name] = { waiting, active, completed, failed, delayed };
  }

  return counts;
}

/**
 * Gracefully close all queues and workers
 */
export async function closeQueues(): Promise<void> {
  // Close workers first
  for (const worker of workers.values()) {
    await worker.close();
  }
  workers.clear();

  // Close queue events
  for (const events of queueEvents.values()) {
    await events.close();
  }
  queueEvents.clear();

  // Close queues
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();

  // Close shared Redis connection
  if (sharedRedisConnection) {
    await sharedRedisConnection.quit();
    sharedRedisConnection = null;
  }
}
