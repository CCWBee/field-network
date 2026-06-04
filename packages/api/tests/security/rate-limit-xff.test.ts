/**
 * Rate-limit X-Forwarded-For spoofing
 *
 * Without `app.set('trust proxy', ...)`, Express's req.ip falls back to the
 * socket address and X-Forwarded-For is ignored. The previous keyGenerator
 * read XFF directly, so an attacker could send a different XFF on every
 * request and never hit the same rate-limit bucket.
 *
 * After the fix the keyGenerator uses req.ip — which honours trust-proxy
 * config — so spoofed XFF headers can't be used to rotate buckets.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { generalLimiter } from '../../src/middleware/rateLimit';

function buildApp() {
  const app = express();
  // Deliberately do NOT call app.set('trust proxy', ...) — we want to verify
  // that the limiter ignores X-Forwarded-For when trust-proxy is off.
  app.use(generalLimiter);
  app.get('/probe', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('Rate limit XFF spoofing protection', () => {
  it('does not partition the bucket by X-Forwarded-For when trust proxy is off', async () => {
    const app = buildApp();
    const sample = 25;

    const responses: number[] = [];
    for (let i = 0; i < sample; i++) {
      const res = await request(app)
        .get('/probe')
        .set('X-Forwarded-For', `10.0.0.${i}`);
      responses.push(res.status);
    }

    // After 25 requests all from the same socket-IP (supertest connects locally),
    // we expect the bucket headers to count UP, not reset on every request.
    // If the limiter were keyed by X-Forwarded-For, RateLimit-Remaining would
    // stay at maxRequests-1 across all of them.
    const last = await request(app)
      .get('/probe')
      .set('X-Forwarded-For', '10.0.0.99');

    const remaining = Number(last.headers['ratelimit-remaining']);
    // After 26 same-IP requests, remaining should have decreased by at least
    // ~20 (allowing for the limiter's clock resolution).
    expect(remaining).toBeLessThan(100 - 20);
  });
});
