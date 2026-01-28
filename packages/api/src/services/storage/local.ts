/**
 * Local Storage Provider
 *
 * File system-based storage provider for development and testing.
 * Implements the StorageProvider interface using local file system
 * with simulated signed URLs.
 */

import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  StorageProvider,
  LocalStorageConfig,
  UploadOptions,
  DownloadOptions,
  DeleteOptions,
  UploadUrlResult,
  DownloadUrlResult,
  FileMetadata,
  StorageResult,
  HealthCheckResult,
} from './types';

/**
 * In-memory token store for simulating signed URLs.
 * In production, this would be replaced by actual S3 signed URL validation.
 */
interface StoredToken {
  key: string;
  expiresAt: Date;
  contentType: string;
  operation: 'upload' | 'download';
}

const tokenStore = new Map<string, StoredToken>();

/**
 * Clean expired tokens from the store.
 */
function cleanExpiredTokens(): void {
  const now = new Date();
  const entries = Array.from(tokenStore.entries());
  for (const [id, token] of entries) {
    if (token.expiresAt < now) {
      tokenStore.delete(id);
    }
  }
}

/**
 * Local Storage Provider Implementation
 *
 * Uses the local file system for storage with token-based
 * signed URL simulation for development parity with S3.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly providerName = 'local';

  private readonly storageDir: string;
  private readonly baseUrl: string;

  constructor(config: LocalStorageConfig) {
    this.storageDir = config.storageDir;
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash

    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Generate a simulated pre-signed upload URL.
   */
  async generateUploadUrl(key: string, options: UploadOptions): Promise<StorageResult<UploadUrlResult>> {
    try {
      const uploadId = randomBytes(16).toString('hex');
      const expiresIn = options.expiresIn ?? 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Store token for validation
      tokenStore.set(uploadId, {
        key,
        expiresAt,
        contentType: options.contentType,
        operation: 'upload',
      });

      // Clean up old tokens periodically
      cleanExpiredTokens();

      return {
        success: true,
        data: {
          uploadUrl: `${this.baseUrl}/v1/storage/upload/${uploadId}`,
          uploadId,
          method: 'PUT',
          headers: {
            'Content-Type': options.contentType,
          },
          expiresAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error generating upload URL',
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * Generate a simulated pre-signed download URL.
   */
  async generateDownloadUrl(key: string, options?: DownloadOptions): Promise<StorageResult<DownloadUrlResult>> {
    try {
      // Check if file exists
      const filePath = this.getFilePath(key);
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `File not found: ${key}`,
          errorCode: 'NOT_FOUND',
        };
      }

      const downloadId = randomBytes(16).toString('hex');
      const expiresIn = options?.expiresIn ?? 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Store token for validation
      tokenStore.set(downloadId, {
        key,
        expiresAt,
        contentType: '',
        operation: 'download',
      });

      // Clean up old tokens periodically
      cleanExpiredTokens();

      let downloadUrl = `${this.baseUrl}/v1/storage/download/${downloadId}`;
      if (options?.downloadFilename) {
        downloadUrl += `?filename=${encodeURIComponent(options.downloadFilename)}`;
      }

      return {
        success: true,
        data: {
          downloadUrl,
          expiresAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error generating download URL',
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * Check if a file exists.
   */
  async fileExists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return fs.existsSync(filePath);
  }

  /**
   * Get file metadata.
   */
  async getMetadata(key: string): Promise<StorageResult<FileMetadata>> {
    try {
      const filePath = this.getFilePath(key);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `File not found: ${key}`,
          errorCode: 'NOT_FOUND',
        };
      }

      const stats = fs.statSync(filePath);
      const hash = await this.getFileHash(key);

      return {
        success: true,
        data: {
          key,
          sizeBytes: stats.size,
          contentType: this.guessContentType(key),
          sha256: hash || undefined,
          lastModified: stats.mtime,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting metadata',
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * Calculate SHA256 hash of a file.
   */
  async getFileHash(key: string): Promise<string | null> {
    const filePath = this.getFilePath(key);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    return createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Delete a file.
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageResult> {
    try {
      const filePath = this.getFilePath(key);

      if (!fs.existsSync(filePath)) {
        if (options?.ignoreNotFound) {
          return { success: true };
        }
        return {
          success: false,
          error: `File not found: ${key}`,
          errorCode: 'NOT_FOUND',
        };
      }

      fs.unlinkSync(filePath);

      // Clean up empty parent directories
      this.cleanupEmptyDirs(path.dirname(filePath));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error deleting file',
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * Delete multiple files.
   */
  async deleteFiles(keys: string[], options?: DeleteOptions): Promise<StorageResult<{ deleted: number; failed: string[] }>> {
    const failed: string[] = [];
    let deleted = 0;

    for (const key of keys) {
      const result = await this.deleteFile(key, options);
      if (result.success) {
        deleted++;
      } else if (result.errorCode !== 'NOT_FOUND' || !options?.ignoreNotFound) {
        failed.push(key);
      }
    }

    return {
      success: failed.length === 0,
      data: { deleted, failed },
    };
  }

  /**
   * Upload a file directly.
   */
  async uploadFile(key: string, data: Buffer, contentType: string): Promise<StorageResult> {
    try {
      const filePath = this.getFilePath(key);
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, data);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error uploading file',
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * Download a file directly.
   */
  async downloadFile(key: string): Promise<StorageResult<Buffer>> {
    try {
      const filePath = this.getFilePath(key);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `File not found: ${key}`,
          errorCode: 'NOT_FOUND',
        };
      }

      const data = fs.readFileSync(filePath);
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error downloading file',
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * Check storage health.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // Check if storage directory exists and is writable
      if (!fs.existsSync(this.storageDir)) {
        return {
          healthy: false,
          provider: this.providerName,
          error: 'Storage directory does not exist',
        };
      }

      // Try to write and read a test file
      const testKey = `.health-check-${Date.now()}`;
      const testPath = path.join(this.storageDir, testKey);

      fs.writeFileSync(testPath, 'health-check');
      const content = fs.readFileSync(testPath, 'utf-8');
      fs.unlinkSync(testPath);

      if (content !== 'health-check') {
        return {
          healthy: false,
          provider: this.providerName,
          error: 'Read/write verification failed',
        };
      }

      return {
        healthy: true,
        provider: this.providerName,
        details: {
          storageDir: this.storageDir,
          baseUrl: this.baseUrl,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.providerName,
        error: error instanceof Error ? error.message : 'Unknown health check error',
      };
    }
  }

  // ============================================================================
  // Token validation methods (used by upload/download routes)
  // ============================================================================

  /**
   * Validate and retrieve an upload token.
   * Returns the token data if valid, null if invalid or expired.
   */
  validateUploadToken(uploadId: string): { key: string; contentType: string } | null {
    const token = tokenStore.get(uploadId);

    if (!token) {
      return null;
    }

    if (token.operation !== 'upload') {
      return null;
    }

    if (token.expiresAt < new Date()) {
      tokenStore.delete(uploadId);
      return null;
    }

    return {
      key: token.key,
      contentType: token.contentType,
    };
  }

  /**
   * Validate and retrieve a download token.
   * Returns the token data if valid, null if invalid or expired.
   */
  validateDownloadToken(downloadId: string): { key: string } | null {
    const token = tokenStore.get(downloadId);

    if (!token) {
      return null;
    }

    if (token.operation !== 'download') {
      return null;
    }

    if (token.expiresAt < new Date()) {
      tokenStore.delete(downloadId);
      return null;
    }

    return { key: token.key };
  }

  /**
   * Consume (invalidate) a token after successful use.
   */
  consumeToken(tokenId: string): void {
    tokenStore.delete(tokenId);
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  /**
   * Get the full file path for a storage key.
   * Sanitizes the key to prevent directory traversal attacks.
   */
  private getFilePath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitizedKey = key
      .replace(/\.\./g, '') // Remove ..
      .replace(/^\/+/, '') // Remove leading slashes
      .replace(/\/+/g, path.sep); // Normalize separators

    return path.join(this.storageDir, sanitizedKey);
  }

  /**
   * Clean up empty directories after file deletion.
   */
  private cleanupEmptyDirs(dir: string): void {
    // Don't delete the root storage directory
    if (dir === this.storageDir || !dir.startsWith(this.storageDir)) {
      return;
    }

    try {
      const files = fs.readdirSync(dir);
      if (files.length === 0) {
        fs.rmdirSync(dir);
        this.cleanupEmptyDirs(path.dirname(dir));
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  /**
   * Guess content type from file extension.
   */
  private guessContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}

/**
 * Create a local storage provider instance with default configuration.
 */
export function createLocalStorageProvider(config?: Partial<LocalStorageConfig>): LocalStorageProvider {
  const defaultConfig: LocalStorageConfig = {
    storageDir: process.env.STORAGE_DIR || path.join(process.cwd(), 'uploads'),
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  };

  return new LocalStorageProvider({
    ...defaultConfig,
    ...config,
  });
}
