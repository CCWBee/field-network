/**
 * Storage Service
 *
 * For mk0: Mock storage with local file system.
 * For production: Swap to S3, Azure Blob, or similar with signed URLs.
 */

import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageProvider {
  generateUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<{ uploadUrl: string; uploadId: string }>;
  generateDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  getFileHash(key: string): Promise<string | null>;
  fileExists(key: string): Promise<boolean>;
}

// Local storage directory
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'uploads');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// In-memory upload tokens for mock signed URLs
const uploadTokens = new Map<string, { key: string; expiresAt: Date; contentType: string }>();

/**
 * Mock Storage Provider
 * Uses local file system with signed URL simulation.
 */
class MockStorageProvider implements StorageProvider {
  async generateUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<{ uploadUrl: string; uploadId: string }> {
    const uploadId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Store upload token
    uploadTokens.set(uploadId, { key, expiresAt, contentType });

    // Clean expired tokens periodically
    this.cleanExpiredTokens();

    // Return URL that points to our upload endpoint
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const uploadUrl = `${baseUrl}/v1/uploads/${uploadId}`;

    return { uploadUrl, uploadId };
  }

  async generateDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const downloadId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Store download token
    uploadTokens.set(downloadId, { key, expiresAt, contentType: '' });

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    return `${baseUrl}/v1/downloads/${downloadId}`;
  }

  async getFileHash(key: string): Promise<string | null> {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    return createHash('sha256').update(fileBuffer).digest('hex');
  }

  async fileExists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return fs.existsSync(filePath);
  }

  // Helper to validate and consume upload token
  validateUploadToken(uploadId: string): { key: string; contentType: string } | null {
    const token = uploadTokens.get(uploadId);
    if (!token) return null;
    if (token.expiresAt < new Date()) {
      uploadTokens.delete(uploadId);
      return null;
    }
    return { key: token.key, contentType: token.contentType };
  }

  consumeUploadToken(uploadId: string): void {
    uploadTokens.delete(uploadId);
  }

  // Save file to local storage
  async saveFile(key: string, data: Buffer): Promise<void> {
    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, data);
  }

  // Read file from local storage
  async readFile(key: string): Promise<Buffer | null> {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath);
  }

  private getFilePath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitizedKey = key.replace(/\.\./g, '').replace(/^\//, '');
    return path.join(STORAGE_DIR, sanitizedKey);
  }

  private cleanExpiredTokens(): void {
    const now = new Date();
    for (const [id, token] of uploadTokens.entries()) {
      if (token.expiresAt < now) {
        uploadTokens.delete(id);
      }
    }
  }
}

// Export singleton instance
export const storageProvider = new MockStorageProvider();

// Helper functions for routes
export async function getSignedUploadUrl(key: string, contentType: string, expiresIn?: number) {
  return storageProvider.generateUploadUrl(key, contentType, expiresIn);
}

export async function getSignedDownloadUrl(key: string, expiresIn?: number) {
  return storageProvider.generateDownloadUrl(key, expiresIn);
}

export function validateUploadToken(uploadId: string) {
  return storageProvider.validateUploadToken(uploadId);
}

export function consumeUploadToken(uploadId: string) {
  return storageProvider.consumeUploadToken(uploadId);
}

export async function saveFile(key: string, data: Buffer) {
  return storageProvider.saveFile(key, data);
}

export async function readFile(key: string) {
  return storageProvider.readFile(key);
}

export async function getFileHash(key: string) {
  return storageProvider.getFileHash(key);
}
