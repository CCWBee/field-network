/**
 * Storage Provider Factory
 *
 * Creates and manages storage provider instances based on configuration.
 * Supports local file storage for development and S3-compatible storage for production.
 */

import {
  StorageProvider,
  StorageConfig,
  LocalStorageConfig,
  S3StorageConfig,
  UploadOptions,
  DownloadOptions,
  DeleteOptions,
  StorageResult,
  UploadUrlResult,
  DownloadUrlResult,
  FileMetadata,
  HealthCheckResult,
} from './types';
import { LocalStorageProvider, createLocalStorageProvider } from './local';
import { S3StorageProvider, createS3StorageProvider } from './s3';

// Re-export types for convenience
export * from './types';
export { LocalStorageProvider, createLocalStorageProvider } from './local';
export { S3StorageProvider, createS3StorageProvider } from './s3';

/**
 * Storage provider type identifiers.
 */
export type StorageProviderType = 'local' | 's3';

/**
 * Singleton storage provider instance.
 */
let storageProviderInstance: StorageProvider | null = null;

/**
 * Get the configured storage provider.
 *
 * Uses the STORAGE_PROVIDER environment variable to determine which
 * provider to use. Defaults to 'local' for development.
 *
 * @returns The configured storage provider instance
 * @throws Error if provider configuration is invalid
 *
 * @example
 * ```typescript
 * const storage = getStorageProvider();
 * const result = await storage.generateUploadUrl('file.jpg', { contentType: 'image/jpeg' });
 * ```
 */
export function getStorageProvider(): StorageProvider {
  if (storageProviderInstance) {
    return storageProviderInstance;
  }

  const providerType = (process.env.STORAGE_PROVIDER || 'local').toLowerCase() as StorageProviderType;

  switch (providerType) {
    case 'local':
      storageProviderInstance = createLocalStorageProvider();
      console.log('[Storage] Using local file storage provider');
      break;

    case 's3':
      storageProviderInstance = createS3StorageProvider();
      console.log(`[Storage] Using S3 storage provider (bucket: ${process.env.S3_BUCKET})`);
      break;

    default:
      throw new Error(
        `Unknown storage provider: ${providerType}. ` +
        'Set STORAGE_PROVIDER to "local" or "s3".'
      );
  }

  return storageProviderInstance;
}

/**
 * Create a storage provider with explicit configuration.
 *
 * Use this for testing or when you need multiple providers.
 *
 * @param type - Provider type ('local' or 's3')
 * @param config - Provider-specific configuration
 * @returns A new storage provider instance
 */
export function createStorageProvider(type: 'local', config?: Partial<LocalStorageConfig>): LocalStorageProvider;
export function createStorageProvider(type: 's3', config?: Partial<S3StorageConfig>): S3StorageProvider;
export function createStorageProvider(type: StorageProviderType, config?: Partial<StorageConfig>): StorageProvider;
export function createStorageProvider(
  type: StorageProviderType,
  config?: Partial<StorageConfig>
): StorageProvider {
  switch (type) {
    case 'local':
      return createLocalStorageProvider(config as Partial<LocalStorageConfig>);
    case 's3':
      return createS3StorageProvider(config as Partial<S3StorageConfig>);
    default:
      throw new Error(`Unknown storage provider type: ${type}`);
  }
}

/**
 * Reset the singleton storage provider instance.
 *
 * Useful for testing when you need to reconfigure the provider.
 */
export function resetStorageProvider(): void {
  storageProviderInstance = null;
}

/**
 * Set a custom storage provider instance.
 *
 * Useful for testing with mock providers.
 *
 * @param provider - Custom storage provider to use
 */
export function setStorageProvider(provider: StorageProvider): void {
  storageProviderInstance = provider;
}

// ============================================================================
// Convenience functions that use the singleton provider
// ============================================================================

/**
 * Generate a pre-signed URL for uploading a file.
 */
export async function generateUploadUrl(
  key: string,
  options: UploadOptions
): Promise<StorageResult<UploadUrlResult>> {
  return getStorageProvider().generateUploadUrl(key, options);
}

/**
 * Generate a pre-signed URL for downloading a file.
 */
export async function generateDownloadUrl(
  key: string,
  options?: DownloadOptions
): Promise<StorageResult<DownloadUrlResult>> {
  return getStorageProvider().generateDownloadUrl(key, options);
}

/**
 * Check if a file exists.
 */
export async function fileExists(key: string): Promise<boolean> {
  return getStorageProvider().fileExists(key);
}

/**
 * Get file metadata.
 */
export async function getMetadata(key: string): Promise<StorageResult<FileMetadata>> {
  return getStorageProvider().getMetadata(key);
}

/**
 * Calculate SHA256 hash of a stored file.
 */
export async function getFileHash(key: string): Promise<string | null> {
  return getStorageProvider().getFileHash(key);
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(key: string, options?: DeleteOptions): Promise<StorageResult> {
  return getStorageProvider().deleteFile(key, options);
}

/**
 * Delete multiple files from storage.
 */
export async function deleteFiles(
  keys: string[],
  options?: DeleteOptions
): Promise<StorageResult<{ deleted: number; failed: string[] }>> {
  return getStorageProvider().deleteFiles(keys, options);
}

/**
 * Upload file content directly.
 */
export async function uploadFile(key: string, data: Buffer, contentType: string): Promise<StorageResult> {
  return getStorageProvider().uploadFile(key, data, contentType);
}

/**
 * Download file content directly.
 */
export async function downloadFile(key: string): Promise<StorageResult<Buffer>> {
  return getStorageProvider().downloadFile(key);
}

/**
 * Check storage provider health.
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  return getStorageProvider().healthCheck();
}

// ============================================================================
// Local provider token validation (for upload/download routes)
// ============================================================================

/**
 * Validate an upload token (local provider only).
 *
 * Returns null if the provider is not local or token is invalid.
 */
export function validateUploadToken(uploadId: string): { key: string; contentType: string } | null {
  const provider = getStorageProvider();
  if (provider instanceof LocalStorageProvider) {
    return provider.validateUploadToken(uploadId);
  }
  return null;
}

/**
 * Validate a download token (local provider only).
 *
 * Returns null if the provider is not local or token is invalid.
 */
export function validateDownloadToken(downloadId: string): { key: string } | null {
  const provider = getStorageProvider();
  if (provider instanceof LocalStorageProvider) {
    return provider.validateDownloadToken(downloadId);
  }
  return null;
}

/**
 * Consume (invalidate) a token (local provider only).
 */
export function consumeToken(tokenId: string): void {
  const provider = getStorageProvider();
  if (provider instanceof LocalStorageProvider) {
    provider.consumeToken(tokenId);
  }
}
