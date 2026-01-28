/**
 * Storage Provider Interface Definitions
 *
 * This module defines the contract for storage providers used in Field Network.
 * Implementations include LocalStorageProvider for development and S3StorageProvider
 * for production with S3-compatible object storage (AWS S3, MinIO, Cloudflare R2).
 */

/**
 * Result of a signed upload URL generation.
 */
export interface UploadUrlResult {
  /** The pre-signed URL where the file should be uploaded */
  uploadUrl: string;
  /** Unique identifier for this upload operation */
  uploadId: string;
  /** HTTP method to use for upload (PUT for most providers) */
  method: 'PUT' | 'POST';
  /** Additional headers that must be included in the upload request */
  headers?: Record<string, string>;
  /** Expiration timestamp for the signed URL */
  expiresAt: Date;
}

/**
 * Result of a signed download URL generation.
 */
export interface DownloadUrlResult {
  /** The pre-signed URL for downloading the file */
  downloadUrl: string;
  /** Expiration timestamp for the signed URL */
  expiresAt: Date;
}

/**
 * File metadata returned after upload or from storage.
 */
export interface FileMetadata {
  /** Storage key (path) of the file */
  key: string;
  /** File size in bytes */
  sizeBytes: number;
  /** MIME content type */
  contentType: string;
  /** SHA256 hash of file contents */
  sha256?: string;
  /** Last modification timestamp */
  lastModified?: Date;
  /** ETag for cache validation */
  etag?: string;
}

/**
 * Options for upload URL generation.
 */
export interface UploadOptions {
  /** Expected content type of the upload */
  contentType: string;
  /** URL expiration time in seconds (default: 3600) */
  expiresIn?: number;
  /** Expected file size in bytes (for content-length validation) */
  expectedSizeBytes?: number;
  /** Custom metadata to attach to the object */
  metadata?: Record<string, string>;
}

/**
 * Options for download URL generation.
 */
export interface DownloadOptions {
  /** URL expiration time in seconds (default: 3600) */
  expiresIn?: number;
  /** Override the Content-Disposition header for downloads */
  downloadFilename?: string;
}

/**
 * Options for file deletion.
 */
export interface DeleteOptions {
  /** If true, don't throw error if file doesn't exist */
  ignoreNotFound?: boolean;
}

/**
 * Result of storage operations that may fail.
 */
export interface StorageResult<T = void> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'NOT_FOUND' | 'ACCESS_DENIED' | 'INVALID_KEY' | 'QUOTA_EXCEEDED' | 'NETWORK_ERROR' | 'UNKNOWN';
}

/**
 * Storage provider health check result.
 */
export interface HealthCheckResult {
  /** Whether the storage is healthy and accessible */
  healthy: boolean;
  /** Provider name/type */
  provider: string;
  /** Bucket name (if applicable) */
  bucket?: string;
  /** Additional diagnostic information */
  details?: Record<string, unknown>;
  /** Error message if unhealthy */
  error?: string;
}

/**
 * Storage Provider Interface
 *
 * All storage implementations must implement this interface.
 * The interface is designed to be cloud-agnostic and work with
 * S3-compatible APIs as well as local file systems.
 */
export interface StorageProvider {
  /**
   * Provider identifier for logging and debugging.
   */
  readonly providerName: string;

  /**
   * Generate a pre-signed URL for uploading a file.
   *
   * @param key - The storage key (path) where the file will be stored
   * @param options - Upload configuration options
   * @returns Promise resolving to upload URL details or error result
   *
   * @example
   * ```typescript
   * const result = await storage.generateUploadUrl(
   *   'submissions/123/photo.jpg',
   *   { contentType: 'image/jpeg', expiresIn: 3600 }
   * );
   * if (result.success) {
   *   console.log('Upload to:', result.data.uploadUrl);
   * }
   * ```
   */
  generateUploadUrl(key: string, options: UploadOptions): Promise<StorageResult<UploadUrlResult>>;

  /**
   * Generate a pre-signed URL for downloading a file.
   *
   * @param key - The storage key (path) of the file to download
   * @param options - Download configuration options
   * @returns Promise resolving to download URL details or error result
   *
   * @example
   * ```typescript
   * const result = await storage.generateDownloadUrl(
   *   'submissions/123/photo.jpg',
   *   { expiresIn: 3600, downloadFilename: 'evidence.jpg' }
   * );
   * if (result.success) {
   *   res.redirect(302, result.data.downloadUrl);
   * }
   * ```
   */
  generateDownloadUrl(key: string, options?: DownloadOptions): Promise<StorageResult<DownloadUrlResult>>;

  /**
   * Check if a file exists at the given key.
   *
   * @param key - The storage key (path) to check
   * @returns Promise resolving to true if file exists, false otherwise
   */
  fileExists(key: string): Promise<boolean>;

  /**
   * Get metadata for a stored file.
   *
   * @param key - The storage key (path) of the file
   * @returns Promise resolving to file metadata or error result
   */
  getMetadata(key: string): Promise<StorageResult<FileMetadata>>;

  /**
   * Calculate SHA256 hash of a stored file.
   *
   * @param key - The storage key (path) of the file
   * @returns Promise resolving to hex-encoded SHA256 hash or null if file not found
   */
  getFileHash(key: string): Promise<string | null>;

  /**
   * Delete a file from storage.
   *
   * @param key - The storage key (path) of the file to delete
   * @param options - Deletion options
   * @returns Promise resolving to success/failure result
   */
  deleteFile(key: string, options?: DeleteOptions): Promise<StorageResult>;

  /**
   * Delete multiple files from storage.
   *
   * @param keys - Array of storage keys to delete
   * @param options - Deletion options
   * @returns Promise resolving to result with count of deleted files
   */
  deleteFiles(keys: string[], options?: DeleteOptions): Promise<StorageResult<{ deleted: number; failed: string[] }>>;

  /**
   * Upload file content directly (for server-side uploads).
   *
   * Note: For client uploads, prefer generateUploadUrl for security.
   *
   * @param key - The storage key (path) where the file will be stored
   * @param data - File content as Buffer
   * @param contentType - MIME type of the content
   * @returns Promise resolving to success/failure result
   */
  uploadFile(key: string, data: Buffer, contentType: string): Promise<StorageResult>;

  /**
   * Download file content directly (for server-side processing).
   *
   * Note: For client downloads, prefer generateDownloadUrl for security.
   *
   * @param key - The storage key (path) of the file to download
   * @returns Promise resolving to file content as Buffer or error result
   */
  downloadFile(key: string): Promise<StorageResult<Buffer>>;

  /**
   * Check storage provider health and connectivity.
   *
   * @returns Promise resolving to health check result
   */
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * Configuration for local storage provider.
 */
export interface LocalStorageConfig {
  /** Base directory for file storage */
  storageDir: string;
  /** Base URL for generating signed URLs (e.g., http://localhost:3000) */
  baseUrl: string;
}

/**
 * Configuration for S3 storage provider.
 */
export interface S3StorageConfig {
  /** S3 bucket name */
  bucket: string;
  /** AWS region (e.g., 'us-east-1') */
  region: string;
  /** S3-compatible endpoint URL (for MinIO, R2, etc.) */
  endpoint?: string;
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Force path-style URLs (required for MinIO) */
  forcePathStyle?: boolean;
  /** Enable server-side encryption (SSE-S3) */
  serverSideEncryption?: boolean;
  /** Custom domain for signed URLs (e.g., CDN) */
  publicUrlBase?: string;
}

/**
 * Union type for all storage configurations.
 */
export type StorageConfig = LocalStorageConfig | S3StorageConfig;
