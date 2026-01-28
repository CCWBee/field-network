import { Router, Request, Response } from 'express';
import { getDatabaseStatus } from '../services/database';
import { getJobQueueStatus } from '../lib/queue';

const router = Router();

interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  components: {
    database: {
      status: 'connected' | 'error';
      latencyMs?: number;
      error?: string;
    };
    jobQueue: {
      status: 'connected' | 'error' | 'disabled';
      latencyMs?: number;
      error?: string;
    };
  };
}

/**
 * GET /health
 * Health check endpoint for load balancers and monitoring
 *
 * Returns:
 * - 200 OK: All systems operational
 * - 503 Service Unavailable: One or more critical components are down
 *
 * Response includes:
 * - status: 'ok' | 'degraded' | 'unhealthy'
 * - timestamp: ISO 8601 timestamp
 * - version: Application version from package.json
 * - uptime: Process uptime in seconds
 * - components: Individual component status
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = process.hrtime();

  // Check database status
  const dbStatus = await getDatabaseStatus();

  // Check job queue status (Redis/BullMQ)
  let jobQueueStatus: HealthStatus['components']['jobQueue'];
  try {
    jobQueueStatus = await getJobQueueStatus();
  } catch {
    jobQueueStatus = { status: 'disabled' };
  }

  // Determine overall status
  let overallStatus: HealthStatus['status'] = 'ok';

  // Database is critical - if down, we're unhealthy
  if (!dbStatus.connected) {
    overallStatus = 'unhealthy';
  }
  // Job queue is important but not critical - if down, we're degraded
  else if (jobQueueStatus.status === 'error') {
    overallStatus = 'degraded';
  }

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: Math.floor(process.uptime()),
    components: {
      database: {
        status: dbStatus.connected ? 'connected' : 'error',
        latencyMs: dbStatus.latencyMs,
        error: dbStatus.error,
      },
      jobQueue: jobQueueStatus,
    },
  };

  // Return appropriate status code
  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  res.status(statusCode).json(health);
});

/**
 * GET /health/ready
 * Readiness probe for Kubernetes/orchestrators
 * Returns 200 if the service is ready to accept traffic
 */
router.get('/ready', async (req: Request, res: Response) => {
  const dbStatus = await getDatabaseStatus();

  if (dbStatus.connected) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, error: 'Database not ready' });
  }
});

/**
 * GET /health/live
 * Liveness probe for Kubernetes/orchestrators
 * Returns 200 if the process is alive (doesn't check external dependencies)
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

export default router;
