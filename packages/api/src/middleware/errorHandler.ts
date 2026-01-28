/**
 * Error Handling Middleware
 *
 * Production-hardened error handling with:
 * - No stack traces or internal paths in production responses
 * - Consistent error response format
 * - Error logging with request context
 * - Support for various error types
 * - Request ID tracking for debugging
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Check if running in production mode
 */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Base application error class
 */
export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.name = 'AppError';

    // Capture stack trace, excluding constructor call
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    // Use generic message to avoid revealing resource existence
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class StateTransitionError extends AppError {
  constructor(from: string, to: string, resource: string) {
    super(
      `Invalid state transition from '${from}' to '${to}' for ${resource}`,
      409,
      'INVALID_STATE_TRANSITION'
    );
    this.name = 'StateTransitionError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? `. Try again in ${retryAfter} seconds` : ''}`,
      429,
      'RATE_LIMIT_EXCEEDED'
    );
    this.name = 'RateLimitError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string = 'Service') {
    super(`${service} temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Generate unique request ID for tracking
 */
function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) ||
    `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Sanitize error message for production
 *
 * Removes internal paths, stack traces, and sensitive information
 */
function sanitizeErrorMessage(message: string): string {
  if (!isProduction) return message;

  // Remove file paths
  message = message.replace(/\b[A-Za-z]:[\\/][^\s]+/g, '[path]');
  message = message.replace(/\/[^\s]+\.(ts|js|json)/g, '[path]');

  // Remove line numbers
  message = message.replace(/:\d+:\d+/g, '');

  // Truncate very long messages
  if (message.length > 500) {
    message = message.substring(0, 500) + '...';
  }

  return message;
}

/**
 * Log error with context
 */
function logError(err: Error, req: Request, requestId: string): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    errorName: err.name,
    errorMessage: err.message,
    // Only include stack in development or for debugging
    ...((!isProduction || process.env.LOG_STACKS === 'true') && {
      stack: err.stack,
    }),
    // Include user ID if authenticated (but not the full user object)
    ...((req as any).user && { userId: (req as any).user.id }),
    // Include relevant headers for debugging
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };

  // Use structured logging in production
  if (isProduction && process.env.LOG_FORMAT === 'json') {
    console.error(JSON.stringify(logEntry));
  } else {
    console.error(`[ERROR] ${requestId} ${err.name}: ${err.message}`, {
      path: req.path,
      method: req.method,
      stack: err.stack,
    });
  }
}

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  details?: unknown;
}

/**
 * Main error handler middleware
 *
 * SECURITY NOTES:
 * - Never expose stack traces in production
 * - Never expose internal file paths
 * - Use generic messages for unexpected errors
 * - Include request ID for debugging without exposing internals
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = getRequestId(req);

  // Log the full error server-side
  logError(err, req, requestId);

  // Build response
  const response: ErrorResponse = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId,
  };

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    response.error = 'Validation error';
    response.code = 'VALIDATION_ERROR';

    // Include field-level details (safe to expose)
    response.details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    return res.status(400).json(response);
  }

  // Handle known application errors
  if (err instanceof AppError) {
    response.error = sanitizeErrorMessage(err.message);
    response.code = err.code;

    return res.status(err.statusCode).json(response);
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;

    // Handle common Prisma errors with safe messages
    switch (prismaErr.code) {
      case 'P2002': // Unique constraint violation
        response.error = 'A record with this value already exists';
        response.code = 'DUPLICATE_ENTRY';
        return res.status(409).json(response);

      case 'P2025': // Record not found
        response.error = 'Resource not found';
        response.code = 'NOT_FOUND';
        return res.status(404).json(response);

      case 'P2003': // Foreign key constraint
        response.error = 'Related resource not found';
        response.code = 'RELATION_ERROR';
        return res.status(400).json(response);

      default:
        // Fall through to generic error
        break;
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    response.error = 'Invalid or expired token';
    response.code = 'INVALID_TOKEN';
    return res.status(401).json(response);
  }

  // Handle syntax errors in request body
  if (err instanceof SyntaxError && 'body' in err) {
    response.error = 'Invalid JSON in request body';
    response.code = 'INVALID_JSON';
    return res.status(400).json(response);
  }

  // Generic error response for unexpected errors
  // IMPORTANT: Do not expose error details in production
  if (!isProduction) {
    response.error = err.message;
    response.details = {
      name: err.name,
      stack: err.stack?.split('\n').slice(0, 5),
    };
  }

  return res.status(500).json(response);
}

/**
 * Async handler wrapper to catch errors in async routes
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
