/**
 * Geoblock Middleware
 *
 * Blocks requests from US (all states + territories) and UK (GB).
 * Allows Crown Dependencies (Jersey, Guernsey, Isle of Man).
 * Returns HTTP 451 (Unavailable For Legal Reasons) for blocked requests.
 *
 * Geo detection relies on CDN-injected headers:
 *   - CF-IPCountry          (Cloudflare)
 *   - X-Country-Code        (generic reverse proxy)
 *   - X-Vercel-IP-Country   (Vercel)
 *
 * Fails open if no geo header is present (configure CDN to always send headers in prod).
 */

import { Request, Response, NextFunction } from 'express';

// US territories that have their own ISO 3166-1 codes
const US_TERRITORIES = new Set(['AS', 'GU', 'MP', 'PR', 'VI', 'UM']);

// Countries to block
const BLOCKED_COUNTRIES = new Set(['US', 'GB', ...US_TERRITORIES]);

// Crown Dependencies — explicitly allowed even though politically associated with UK
const ALLOWED_CROWN_DEPENDENCIES = new Set(['JE', 'GG', 'IM']);

export function geoblockMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip health-check so monitoring still works
  if (req.path === '/health' || req.path === '/health/') {
    return next();
  }

  const country = detectCountry(req);

  // Fail open: if we can't determine country, allow through
  // (configure your CDN to always inject the header in production)
  if (!country) {
    return next();
  }

  // Crown Dependencies are always allowed
  if (ALLOWED_CROWN_DEPENDENCIES.has(country)) {
    return next();
  }

  // Block US, GB, and US territories
  if (BLOCKED_COUNTRIES.has(country)) {
    res.status(451).json({
      error: 'Unavailable For Legal Reasons',
      code: 'GEO_BLOCKED',
      message: 'This service is not available in your region.',
    });
    return;
  }

  next();
}

function detectCountry(req: Request): string | null {
  // Try headers in priority order
  const cfCountry = req.headers['cf-ipcountry'];
  if (cfCountry && typeof cfCountry === 'string' && cfCountry !== 'XX') {
    return cfCountry.toUpperCase();
  }

  const xCountry = req.headers['x-country-code'];
  if (xCountry && typeof xCountry === 'string') {
    return xCountry.toUpperCase();
  }

  const vercelCountry = req.headers['x-vercel-ip-country'];
  if (vercelCountry && typeof vercelCountry === 'string') {
    return vercelCountry.toUpperCase();
  }

  return null;
}

// Export config for documentation / testing
export const geoblockConfig = {
  blocked: Array.from(BLOCKED_COUNTRIES),
  allowedExceptions: Array.from(ALLOWED_CROWN_DEPENDENCIES),
  headers: ['cf-ipcountry', 'x-country-code', 'x-vercel-ip-country'],
};
