import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { prisma } from '../services/database';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = payload;
    next();
  } catch (error) {
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
    const scopes = JSON.parse(tokenRecord.scopes) as string[];
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
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' } as object, JWT_SECRET, { expiresIn: '7d' as jwt.SignOptions['expiresIn'] });
}
