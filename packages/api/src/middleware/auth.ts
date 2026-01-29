import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../services/database';
import { UnauthorizedError, ForbiddenError } from './errorHandler';
import {
  isTokenBlacklisted,
  wasTokenInvalidatedForUser,
} from '../services/tokenBlacklist';

// JWT_SECRET enforcement: no fallback in production
const JWT_SECRET = getJwtSecret();
const ADMIN_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const MAX_ADMIN_SESSIONS_PER_USER = 3;

/**
 * Get JWT secret with proper enforcement
 * - In production: throws if JWT_SECRET not set
 * - In development/test: uses fallback with warning
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      console.error('FATAL: JWT_SECRET environment variable is required in production');
      process.exit(1);
    }
    if (secret.length < 32) {
      console.error('FATAL: JWT_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    return secret;
  }

  // Development/test: allow fallback with warning
  if (!secret) {
    console.warn('WARNING: JWT_SECRET not set, using insecure development fallback');
    return 'dev-secret-do-not-use-in-production';
  }

  return secret;
}

/**
 * Export JWT_SECRET for use in other modules
 */
export function getJwtSecretForSigning(): string {
  return JWT_SECRET;
}

// Track admin session activity
const adminSessionActivity = new Map<string, { lastActivity: number; ip: string }>();

export interface TokenPayload {
  userId: string;
  email?: string;
  walletAddress?: string;
  role: 'requester' | 'worker' | 'admin';
  scopes: string[];
  apiTokenId?: string; // Present if using delegated API token
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Optional authentication middleware
 * Attaches user info if valid token is present, but allows unauthenticated requests
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  // Try to authenticate, but don't fail if it doesn't work
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as TokenPayload & { iat?: number };

      const blacklisted = await isTokenBlacklisted(token);
      if (!blacklisted) {
        if (payload.iat) {
          const invalidated = await wasTokenInvalidatedForUser(payload.userId, payload.iat);
          if (!invalidated) {
            req.user = payload;
          }
        } else {
          req.user = payload;
        }
      }
    } catch {
      // Token invalid or expired, continue without auth
    }
  }

  next();
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(new UnauthorizedError('Missing authorization header'));
  }

  // Check for API key authentication (delegated credentials)
  if (authHeader.startsWith('Api-Key ')) {
    return authenticateApiKey(req, res, next, authHeader.substring(8));
  }

  // Standard Bearer JWT authentication
  if (!authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Invalid authorization header format'));
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload & { iat?: number };

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return next(new UnauthorizedError('Token has been revoked'));
    }

    // Check if all user tokens were invalidated (e.g., password change)
    if (payload.iat) {
      const invalidated = await wasTokenInvalidatedForUser(payload.userId, payload.iat);
      if (invalidated) {
        return next(new UnauthorizedError('Session has been invalidated'));
      }
    }

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

// Authenticate using delegated API key
async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
  apiKey: string
) {
  try {
    // Look up the API token
    const tokenRecord = await prisma.apiToken.findUnique({
      where: { apiKey },
      include: { user: true },
    });

    if (!tokenRecord) {
      return next(new UnauthorizedError('Invalid API key'));
    }

    // Check if revoked
    if (tokenRecord.revokedAt) {
      return next(new UnauthorizedError('API key has been revoked'));
    }

    // Check expiry
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return next(new UnauthorizedError('API key has expired'));
    }

    // Check user status
    if (tokenRecord.user.status !== 'active') {
      return next(new UnauthorizedError('User account is not active'));
    }

    // Update last used timestamp
    await prisma.apiToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() },
    });

    // Set user context with delegated scopes
    // tokenRecord.scopes is a Json type (already parsed by Prisma)
    const scopes = (tokenRecord.scopes as string[]) || [];
    req.user = {
      userId: tokenRecord.userId,
      email: tokenRecord.user.email || undefined,
      role: tokenRecord.user.role as 'requester' | 'worker' | 'admin',
      scopes,
      apiTokenId: tokenRecord.id,
    };

    next();
  } catch (error) {
    return next(new UnauthorizedError('API key authentication failed'));
  }
}

export function requireRole(...roles: Array<'requester' | 'worker' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`));
    }

    next();
  };
}

export function requireScope(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    const hasScope = scopes.some(scope => req.user!.scopes.includes(scope));
    if (!hasScope) {
      return next(new ForbiddenError(`Requires scope: ${scopes.join(' or ')}`));
    }

    next();
  };
}

export function generateToken(payload: TokenPayload, expiresIn: string | number = '24h'): string {
  // Add jti (JWT ID) for token blacklisting
  const tokenPayload = {
    ...payload,
    jti: uuidv4(),
  };
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

export function generateRefreshToken(userId: string): string {
  // Add jti for refresh token blacklisting
  const payload = {
    userId,
    type: 'refresh',
    jti: uuidv4(),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' as jwt.SignOptions['expiresIn'] });
}

/**
 * Helper to get client IP address from request
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Log admin action for audit trail
 */
export async function logAdminAction(
  req: Request,
  action: string,
  details: Record<string, any> = {}
): Promise<void> {
  const ip = getClientIp(req);
  const userId = req.user?.userId;

  await prisma.auditEvent.create({
    data: {
      actorId: userId || null,
      action: `admin.${action}`,
      objectType: 'admin',
      objectId: userId || 'system',
      ip,
      userAgent: req.get('user-agent') || 'unknown',
      detailsJson: JSON.stringify({
        ...details,
        timestamp: new Date().toISOString(),
      }),
    },
  });
}

/**
 * Middleware for admin authentication hardening
 * - Logs all admin access with IP
 * - Enforces session timeout after 1 hour of inactivity
 * - Limits concurrent admin sessions
 */
export function adminAuthHardening(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError());
  }

  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }

  const sessionKey = `${req.user.userId}:${getClientIp(req)}`;
  const now = Date.now();

  // Check for session timeout
  const existingSession = adminSessionActivity.get(sessionKey);
  if (existingSession) {
    const timeSinceLastActivity = now - existingSession.lastActivity;
    if (timeSinceLastActivity > ADMIN_SESSION_TIMEOUT_MS) {
      adminSessionActivity.delete(sessionKey);
      // Log session timeout
      logAdminAction(req, 'session_timeout', {
        reason: 'inactivity',
        last_activity_ms_ago: timeSinceLastActivity,
      }).catch(console.error);
      return next(new UnauthorizedError('Admin session expired due to inactivity'));
    }
  }

  // Count active sessions for this user (across all IPs)
  const userSessions = Array.from(adminSessionActivity.entries())
    .filter(([key]) => key.startsWith(`${req.user!.userId}:`))
    .filter(([, data]) => now - data.lastActivity < ADMIN_SESSION_TIMEOUT_MS);

  if (!existingSession && userSessions.length >= MAX_ADMIN_SESSIONS_PER_USER) {
    // Remove oldest session to make room for new one
    const oldestSession = userSessions.sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
    if (oldestSession) {
      adminSessionActivity.delete(oldestSession[0]);
    }
  }

  // Update session activity
  adminSessionActivity.set(sessionKey, {
    lastActivity: now,
    ip: getClientIp(req),
  });

  // Log admin access (async, don't wait)
  logAdminAction(req, 'access', {
    endpoint: req.originalUrl,
    method: req.method,
  }).catch(console.error);

  next();
}

/**
 * Log failed admin login attempt
 */
export async function logFailedAdminLogin(
  req: Request,
  email: string,
  reason: string
): Promise<void> {
  const ip = getClientIp(req);

  await prisma.auditEvent.create({
    data: {
      actorId: null,
      action: 'admin.login_failed',
      objectType: 'admin',
      objectId: email,
      ip,
      userAgent: req.get('user-agent') || 'unknown',
      detailsJson: JSON.stringify({
        email,
        reason,
        timestamp: new Date().toISOString(),
      }),
    },
  });
}

/**
 * Clean up stale admin sessions (call periodically)
 */
export function cleanupStaleSessions(): void {
  const now = Date.now();
  for (const [key, data] of adminSessionActivity.entries()) {
    if (now - data.lastActivity > ADMIN_SESSION_TIMEOUT_MS) {
      adminSessionActivity.delete(key);
    }
  }
}
