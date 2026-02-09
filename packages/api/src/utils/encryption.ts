/**
 * Field-level Encryption for PII
 *
 * AES-256-GCM encryption for sensitive fields stored at rest.
 * Used for: User.email, User.displayName
 *
 * Requires ENCRYPTION_KEY env var (32-byte hex string, 64 hex chars).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for PII encryption');
  }
  // Accept 64-char hex string -> 32 bytes
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  // Accept raw 32-byte string (not recommended)
  if (key.length === 32) {
    return Buffer.from(key, 'utf8');
  }
  throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns base64 string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt base64 ciphertext produced by encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(ciphertext, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Hash a value for indexed lookups (e.g., emailHash column for login).
 * Uses SHA-256 with ENCRYPTION_KEY as HMAC key.
 */
export function hashForLookup(value: string): string {
  const key = getEncryptionKey();
  const hash = createHash('sha256');
  hash.update(key);
  hash.update(value.toLowerCase().trim());
  return hash.digest('hex');
}

/**
 * Check if a value looks like it's already encrypted (base64 with expected min length).
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 40) return false;
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
