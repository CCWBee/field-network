/**
 * Request Logging Middleware
 *
 * Adds request ID to all requests and logs request/response details.
 * Uses structured logging with pino for production-ready output.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, createRequestLogger } from '../lib/logger';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: ReturnType<typeof createRequestLogger>;
    }
  }
}

/**
 * Request logging middleware
 *
 * - Generates or uses existing request ID
 * - Attaches child logger to request
 * - Logs request start and completion with timing
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Use existing request ID from headers or generate new one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = requestId;

  // Add request ID to response headers for client correlation
  res.setHeader('x-request-id', requestId);

  // Create child logger with request context
  const userId = (req as any).user?.id;
  req.log = createRequestLogger(requestId, userId);

  const start = process.hrtime.bigint();

  // Log request start at debug level
  req.log.debug({
    msg: 'Request started',
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  // Log response on finish
  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs / BigInt(1_000_000));

    const logData = {
      msg: 'Request completed',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      contentLength: res.get('content-length'),
    };

    // Log at appropriate level based on status code
    if (res.statusCode >= 500) {
      req.log.error(logData);
    } else if (res.statusCode >= 400) {
      req.log.warn(logData);
    } else {
      req.log.info(logData);
    }
  });

  next();
}
