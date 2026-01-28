/**
 * Rate Limiting Middleware
 *
 * Production-hardened rate limiting with:
 * - Configurable limits via environment variables
 * - Different limits for authenticated vs anonymous users
 * - Stricter limits for sensitive endpoints
 * - Trust proxy support for Railway/Vercel deployments
 * - Custom key generation to prevent bypass
 */

import { rateLimit, type Options } from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Configuration from environment
 */
const config = {
  // General rate limiting
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),

  // Authenticated users get higher limits
  maxRequestsAuthenticated: parseInt(process.env.RATE_LIMIT_MAX_AUTH || '500'),

  // Auth endpoints have stricter limits (prevent brute force)
  authWindowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '3600000'), // 1 hour
  maxAuthAttempts: parseInt(process.env.RATE_LIMIT_MAX_AUTH_ATTEMPTS || '10'),

  // Upload endpoints have separate limits
  uploadWindowMs: parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || '3600000'), // 1 hour
  maxUploads: parseInt(process.env.RATE_LIMIT_MAX_UPLOADS || '50'),

  // Enable trust proxy for correct client IP behind load balancers
  trustProxy: process.env.TRUST_PROXY === 'true',
};

/**
 * Custom key generator
 *
 * Uses a combination of IP and user ID (if authenticated) to prevent
 * bypass attacks where an attacker uses different IPs but same account.
 */
function keyGenerator(req: Request): string {
  // Get IP from various headers (trust proxy must be enabled)
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim()
    : req.ip || req.socket.remoteAddress || 'unknown';

  // If user is authenticated, include user ID in key
  // This prevents a single user from making many requests across different IPs
  const userId = (req as any).user?.id;
  if (userId) {
    return `${ip}-${userId}`;
  }

  return ip;
}

/**
 * Standard rate limit message
 */
function standardMessage(req: Request, res: Response): string {
  const retryAfter = res.getHeader('Retry-After');
  return JSON.stringify({
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
    retryAfter: Number(retryAfter),
  });
}

/**
 * Base rate limiter options
 */
const baseOptions: Partial<Options> = {
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  keyGenerator,
  handler: (req, res, next, options) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(options.statusCode).send(standardMessage(req, res));
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
};

/**
 * General API rate limiter
 *
 * Applied to all endpoints. Allows more requests for authenticated users.
 */
export const generalLimiter = rateLimit({
  ...baseOptions,
  windowMs: config.windowMs,
  max: (req) => {
    // Authenticated users get higher limits
    const isAuthenticated = !!(req as any).user;
    return isAuthenticated ? config.maxRequestsAuthenticated : config.maxRequests;
  },
  message: 'Too many requests from this IP, please try again later',
});

/**
 * Authentication rate limiter
 *
 * Stricter limits for auth endpoints to prevent brute force attacks.
 * Applied to: /auth/login, /auth/register, /auth/siwe/verify
 */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: config.authWindowMs, // 1 hour
  max: config.maxAuthAttempts, // 10 attempts
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * Upload rate limiter
 *
 * Separate limits for file uploads to prevent abuse.
 * Applied to: /uploads, /submissions/:id/artefacts
 */
export const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: config.uploadWindowMs, // 1 hour
  max: config.maxUploads, // 50 uploads
  message: 'Too many uploads, please try again later',
});

/**
 * Strict rate limiter for sensitive operations
 *
 * Very low limits for critical endpoints.
 * Applied to: API token creation, password reset, admin actions
 */
export const strictLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  message: 'Too many attempts, please try again later',
});

/**
 * Create custom limiter with specific options
 */
export function createLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  return rateLimit({
    ...baseOptions,
    ...options,
  });
}

/**
 * Rate limit configuration for documentation
 */
export const rateLimitConfig = {
  general: {
    windowMs: config.windowMs,
    maxAnonymous: config.maxRequests,
    maxAuthenticated: config.maxRequestsAuthenticated,
    description: 'Applied to all API endpoints',
  },
  auth: {
    windowMs: config.authWindowMs,
    max: config.maxAuthAttempts,
    description: 'Applied to authentication endpoints (login, register, SIWE)',
  },
  upload: {
    windowMs: config.uploadWindowMs,
    max: config.maxUploads,
    description: 'Applied to file upload endpoints',
  },
  strict: {
    windowMs: 60 * 60 * 1000,
    max: 5,
    description: 'Applied to sensitive operations (API tokens, admin)',
  },
};

/**
 * Log rate limit configuration on startup
 */
export function logRateLimitConfig(): void {
  console.log('Rate Limiting Configuration:');
  console.log(`  General: ${config.maxRequests} req/${config.windowMs / 60000} min (anon)`);
  console.log(`  General: ${config.maxRequestsAuthenticated} req/${config.windowMs / 60000} min (auth)`);
  console.log(`  Auth: ${config.maxAuthAttempts} attempts/${config.authWindowMs / 3600000} hr`);
  console.log(`  Upload: ${config.maxUploads} uploads/${config.uploadWindowMs / 3600000} hr`);
  console.log(`  Trust Proxy: ${config.trustProxy}`);
}
