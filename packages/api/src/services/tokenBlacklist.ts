import { getRedisClient } from '../lib/queue';
import jwt from 'jsonwebtoken';

/**
 * Token Blacklist Service
 *
 * Manages invalidated JWT tokens using Redis.
 * Tokens are stored with TTL matching their expiry time.
 *
 * Redis key format: `blacklist:token:<jti|hash>`
 * Value: "1" (presence indicates blacklisted)
 * TTL: Matches token expiry time
 */

const BLACKLIST_PREFIX = 'blacklist:token:';
const REFRESH_BLACKLIST_PREFIX = 'blacklist:refresh:';
const USER_SESSIONS_PREFIX = 'user:sessions:';

/**
 * Check if Redis is available for blacklist operations
 */
export function isBlacklistAvailable(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Add a token to the blacklist
 *
 * @param token - The JWT token to blacklist
 * @param expiresAt - Token expiry date (used for TTL)
 */
export async function blacklistToken(token: string, expiresAt?: Date): Promise<void> {
  if (!isBlacklistAvailable()) {
    console.warn('Token blacklist unavailable: REDIS_URL not configured');
    return;
  }

  const redis = getRedisClient();

  // Use the token's jti claim if available, otherwise hash the token
  let key: string;
  try {
    const decoded = jwt.decode(token) as { jti?: string; exp?: number } | null;
    if (decoded?.jti) {
      key = `${BLACKLIST_PREFIX}${decoded.jti}`;
    } else {
      // Fallback to hashing the token
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      key = `${BLACKLIST_PREFIX}${hash}`;
    }

    // Calculate TTL from token expiry
    let ttlSeconds: number;
    if (expiresAt) {
      ttlSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    } else if (decoded?.exp) {
      ttlSeconds = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
    } else {
      // Default to 24 hours if no expiry info
      ttlSeconds = 24 * 60 * 60;
    }

    await redis.setex(key, ttlSeconds, '1');
  } catch (error) {
    console.error('Failed to blacklist token:', error);
    throw error;
  }
}

/**
 * Add a refresh token to the blacklist
 *
 * @param token - The refresh token to blacklist
 */
export async function blacklistRefreshToken(token: string): Promise<void> {
  if (!isBlacklistAvailable()) {
    console.warn('Token blacklist unavailable: REDIS_URL not configured');
    return;
  }

  const redis = getRedisClient();

  try {
    const decoded = jwt.decode(token) as { userId?: string; exp?: number } | null;

    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const key = `${REFRESH_BLACKLIST_PREFIX}${hash}`;

    // Refresh tokens last 7 days
    let ttlSeconds: number;
    if (decoded?.exp) {
      ttlSeconds = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
    } else {
      ttlSeconds = 7 * 24 * 60 * 60;
    }

    await redis.setex(key, ttlSeconds, '1');
  } catch (error) {
    console.error('Failed to blacklist refresh token:', error);
    throw error;
  }
}

/**
 * Check if a token is blacklisted
 *
 * @param token - The JWT token to check
 * @returns true if blacklisted, false otherwise
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  if (!isBlacklistAvailable()) {
    // If Redis not available, tokens cannot be blacklisted
    return false;
  }

  const redis = getRedisClient();

  try {
    // Check by jti first
    const decoded = jwt.decode(token) as { jti?: string } | null;
    if (decoded?.jti) {
      const result = await redis.exists(`${BLACKLIST_PREFIX}${decoded.jti}`);
      if (result === 1) return true;
    }

    // Also check by hash (for tokens without jti)
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await redis.exists(`${BLACKLIST_PREFIX}${hash}`);
    return result === 1;
  } catch (error) {
    console.error('Failed to check token blacklist:', error);
    // On error, allow the token (fail open) - but log for monitoring
    return false;
  }
}

/**
 * Check if a refresh token is blacklisted
 *
 * @param token - The refresh token to check
 * @returns true if blacklisted, false otherwise
 */
export async function isRefreshTokenBlacklisted(token: string): Promise<boolean> {
  if (!isBlacklistAvailable()) {
    return false;
  }

  const redis = getRedisClient();

  try {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await redis.exists(`${REFRESH_BLACKLIST_PREFIX}${hash}`);
    return result === 1;
  } catch (error) {
    console.error('Failed to check refresh token blacklist:', error);
    return false;
  }
}

/**
 * Blacklist all tokens for a user (useful for password change, account lock)
 *
 * @param userId - The user ID
 * @param reason - Reason for blacklisting (for logging)
 */
export async function blacklistAllUserTokens(userId: string, reason: string): Promise<void> {
  if (!isBlacklistAvailable()) {
    console.warn('Token blacklist unavailable: REDIS_URL not configured');
    return;
  }

  const redis = getRedisClient();

  try {
    // Store a marker for this user with the current timestamp
    // When validating tokens, we'll check if they were issued before this time
    const key = `${USER_SESSIONS_PREFIX}${userId}:invalidated_at`;
    await redis.setex(key, 7 * 24 * 60 * 60, Date.now().toString());

    console.log(`Blacklisted all tokens for user ${userId}: ${reason}`);
  } catch (error) {
    console.error('Failed to blacklist user tokens:', error);
    throw error;
  }
}

/**
 * Check if a token was issued before user's session invalidation
 *
 * @param userId - The user ID
 * @param issuedAt - Token issue time (iat claim)
 * @returns true if token was invalidated, false otherwise
 */
export async function wasTokenInvalidatedForUser(userId: string, issuedAt: number): Promise<boolean> {
  if (!isBlacklistAvailable()) {
    return false;
  }

  const redis = getRedisClient();

  try {
    const key = `${USER_SESSIONS_PREFIX}${userId}:invalidated_at`;
    const invalidatedAtStr = await redis.get(key);

    if (!invalidatedAtStr) {
      return false;
    }

    const invalidatedAt = parseInt(invalidatedAtStr, 10);
    // Token was issued before invalidation time = invalid
    return issuedAt * 1000 < invalidatedAt;
  } catch (error) {
    console.error('Failed to check user token invalidation:', error);
    return false;
  }
}

/**
 * Get blacklist health status
 */
export async function getBlacklistStatus(): Promise<{
  available: boolean;
  error?: string;
}> {
  if (!isBlacklistAvailable()) {
    return { available: false, error: 'REDIS_URL not configured' };
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}
