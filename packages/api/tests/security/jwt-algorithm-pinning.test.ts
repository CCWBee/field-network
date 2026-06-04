/**
 * JWT Algorithm Pinning
 *
 * Verifies that `authenticate` rejects tokens signed with anything other than
 * HS256. Without algorithm pinning, jwt.verify accepts whatever the token
 * header declares — opening alg=none and HS/RSA confusion attacks.
 */

import { describe, it, expect } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, optionalAuth, getJwtSecretForSigning } from '../../src/middleware/auth';

// JWT_SECRET is resolved at module-load time inside auth.ts (before this file's
// top-level statements run), so reading it from the middleware's own getter
// guarantees the test signs with the same key the middleware verifies with.
const JWT_SECRET = getJwtSecretForSigning();

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeAlgNoneToken(payload: object): string {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  // alg=none expects an empty signature segment
  return `${header}.${body}.`;
}

function mockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    socket: { remoteAddress: '127.0.0.1' } as any,
  };
}

function captureNext() {
  const errors: any[] = [];
  const next: NextFunction = (err?: any) => {
    if (err) errors.push(err);
  };
  return { next, errors };
}

describe('JWT algorithm pinning', () => {
  it('rejects alg=none tokens via authenticate', async () => {
    const token = makeAlgNoneToken({
      userId: 'attacker',
      role: 'admin',
      scopes: ['*'],
    });
    const req = mockReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    await authenticate(req as Request, {} as Response, next);

    expect(errors).toHaveLength(1);
    expect(errors[0].statusCode).toBe(401);
    expect(req.user).toBeUndefined();
  });

  it('rejects HS256 tokens signed with a different secret via authenticate', async () => {
    const token = jwt.sign(
      { userId: 'attacker', role: 'admin', scopes: ['*'] },
      'wrong-secret-not-our-jwt-secret',
      { algorithm: 'HS256' }
    );
    const req = mockReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    await authenticate(req as Request, {} as Response, next);

    expect(errors).toHaveLength(1);
    expect(errors[0].statusCode).toBe(401);
  });

  it('accepts valid HS256 tokens via authenticate', async () => {
    const token = jwt.sign(
      { userId: 'real-user', role: 'worker', scopes: ['tasks:read'] },
      JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const req = mockReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    await authenticate(req as Request, {} as Response, next);

    expect(errors).toHaveLength(0);
    expect(req.user?.userId).toBe('real-user');
  });

  it('silently ignores alg=none tokens via optionalAuth (no req.user set)', async () => {
    const token = makeAlgNoneToken({ userId: 'attacker', role: 'admin', scopes: ['*'] });
    const req = mockReq(`Bearer ${token}`);
    const { next, errors } = captureNext();

    await optionalAuth(req as Request, {} as Response, next);

    expect(errors).toHaveLength(0);
    expect(req.user).toBeUndefined();
  });
});
