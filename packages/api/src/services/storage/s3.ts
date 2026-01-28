/**
 * S3 Storage Provider
 *
 * S3-compatible storage provider for production use.
 * Supports AWS S3, MinIO, Cloudflare R2, and other S3-compatible services.
 * Uses AWS SDK v3 with pre-signed URLs for secure client uploads/downloads.
 */

import { createHash } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageProvider,
  S3StorageConfig,
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
 * S3 Storage Provider Implementation
 *
 * Uses AWS SDK v3 for S3-compatible object storage operations.
 * All client-facing operations use pre-signed URLs for security.
 */
export class S3StorageProvider implements StorageProvider {
  readonly providerName = 's3';

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly serverSideEncryption: boolean;
  private readonly publicUrlBase?: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.region = config.region;
    this.serverSideEncryption = config.serverSideEncryption ?? true;
    this.publicUrlBase = config.publicUrlBase;

    // Configure S3 client
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });
  }

  /**
   * Generate a pre-signed URL for uploading a file.
   */
  async generateUploadUrl(key: string, options: UploadOptions): Promise<StorageResult<UploadUrlResult>> {
    try {
      const expiresIn = options.expiresIn ?? 3600;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options.contentType,
        ...(this.serverSideEncryption && {
          ServerSideEncryption: 'AES256',
        }),
        ...(options.expectedSizeBytes && {
          ContentLength: options.expectedSizeBytes,
        }),
        ...(options.metadata && {
          Metadata: options.metadata,
        }),
      });

      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn,
      });

      // Extract the upload ID from the signature for tracking
      const urlParams = new URL(uploadUrl);
      const uploadId = urlParams.searchParams.get('X-Amz-Signature')?.substring(0, 32) ||
        Math.random().toString(36).substring(2, 18);

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        success: true,
        data: {
          uploadUrl,
          uploadId,
          method: 'PUT',
          headers: {
            'Content-Type': options.contentType,
            ...(this.serverSideEncryption && {
              'x-amz-server-side-encryption': 'AES256',
            }),
          },
          expiresAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error generating upload URL',
        errorCode: this.mapS3Error(error),
      };
    }
  }

  /**
   * Generate a pre-signed URL for downloading a file.
   */
  async generateDownloadUrl(key: string, options?: DownloadOptions): Promise<StorageResult<DownloadUrlResult>> {
    try {
      // First check if the file exists
      const exists = await this.fileExists(key);
      if (!exists) {
        return {
          success: false,
          error: `File not found: ${key}`,
          errorCode: 'NOT_FOUND',
        };
      }

      const expiresIn = options?.expiresIn ?? 3600;

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(options?.downloadFilename && {
          ResponseContentDisposition: `attachment; filename="${options.downloadFilename}"`,
        }),
      });

      let downloadUrl = await getSignedUrl(this.client, command, {
        expiresIn,
      });

      // Optionally rewrite URL to use a CDN
      if (this.publicUrlBase) {
        const url = new URL(downloadUrl);
        const publicBase = new URL(this.publicUrlBase);
        url.hostname = publicBase.hostname;
        url.protocol = publicBase.protocol;
        downloadUrl = url.toString();
      }

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

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
        errorCode: this.mapS3Error(error),
      };
    }
  }

  /**
   * Check if a file exists.
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // For other errors, assume file doesn't exist
      return false;
    }
  }

  /**
   * Get file metadata.
   */
  async getMetadata(key: string): Promise<StorageResult<FileMetadata>> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      return {
        success: true,
        data: {
          key,
          sizeBytes: response.ContentLength ?? 0,
          contentType: response.ContentType ?? 'application/octet-stream',
          lastModified: response.LastModified,
          etag: response.ETag?.replace(/"/g, ''),
        },
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return {
          success: false,
          error: `File not found: ${key}`,
          errorCode: 'NOT_FOUND',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting metadata',
        errorCode: this.mapS3Error(error),
      };
    }
  }

  /**
   * Calculate SHA256 hash of a file.
   * Note: This requires downloading the file, which can be expensive for large files.
   */
  async getFileHash(key: string): Promise<string | null> {
    try {
      const result = await this.downloadFile(key);
      if (!result.success || !result.data) {
        return null;
      }

      return createHash('sha256').update(result.data).digest('hex');
    } catch {
      return null;
    }
  }

  /**
   * Delete a file.
   */
  async deleteFile(key: string, options?: DeleteOptions): Promise<StorageResult> {
    try {
      // Check if file exists first if we need to report errors
      if (!options?.ignoreNotFound) {
        const exists = await this.fileExists(key);
        if (!exists) {
          return {
            success: false,
            error: `File not found: ${key}`,
            errorCode: 'NOT_FOUND',
          };
        }
      }

      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error deleting file',
        errorCode: this.mapS3Error(error),
      };
    }
  }

  /**
   * Delete multiple files.
   */
  async deleteFiles(keys: string[], options?: DeleteOptions): Promise<StorageResult<{ deleted: number; failed: string[] }>> {
    if (keys.length === 0) {
      return {
        success: true,
        data: { deleted: 0, failed: [] },
      };
    }

    try {
      // S3 supports up to 1000 objects per delete request
      const batches: string[][] = [];
      for (let i = 0; i < keys.length; i += 1000) {
        batches.push(keys.slice(i, i + 1000));
      }

      const failed: string[] = [];
      let deleted = 0;

      for (const batch of batches) {
        const response = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: batch.map((key) => ({ Key: key })),
              Quiet: false,
            },
          })
        );

        deleted += response.Deleted?.length ?? 0;

        if (response.Errors && response.Errors.length > 0) {
          for (const error of response.Errors) {
            if (error.Key) {
              failed.push(error.Key);
            }
          }
        }
      }

      return {
        success: failed.length === 0,
        data: { deleted, failed },
      };
    } catch (error) {
      return {
        success: false,
        data: { deleted: 0, failed: keys },
        error: error instanceof Error ? error.message : 'Unknown error deleting files',
        errorCode: this.mapS3Error(error),
      };
    }
  }

  /**
   * Upload a file directly.
   */
  async uploadFile(key: string, data: Buffer, contentType: string): Promise<StorageResult> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
          ...(this.serverSideEncryption && {
            ServerSideEncryption: 'AES256',
          }),
        })
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error uploading file',
        errorCode: this.mapS3Error(error),
      };
    }
  }

  /**
   * Download a file directly.
   */
  async downloadFile(key: string): Promise<StorageResult<Buffer>> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) {
        return {
          success: false,
          error: 'Empty response body',
          errorCode: 'UNKNOWN',
        };
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return {
          success: false,
          error: `File not found: ${key}`,
          errorCode: 'NOT_FOUND',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error downloading file',
        errorCode: this.mapS3Error(error),
      };
    }
  }

  /**
   * Check storage health.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      // List buckets to verify credentials
      const response = await this.client.send(new ListBucketsCommand({}));

      // Check if our bucket exists
      const bucketExists = response.Buckets?.some((b) => b.Name === this.bucket);

      if (!bucketExists) {
        return {
          healthy: false,
          provider: this.providerName,
          bucket: this.bucket,
          error: `Bucket '${this.bucket}' not found`,
        };
      }

      // Try a HEAD request on the bucket
      try {
        await this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: '.health-check-nonexistent-file',
          })
        );
      } catch (error: any) {
        // 404 is expected, anything else is a problem
        if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound') {
          throw error;
        }
      }

      return {
        healthy: true,
        provider: this.providerName,
        bucket: this.bucket,
        details: {
          region: this.region,
          serverSideEncryption: this.serverSideEncryption,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.providerName,
        bucket: this.bucket,
        error: error instanceof Error ? error.message : 'Unknown health check error',
      };
    }
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  /**
   * Map S3 errors to our error codes.
   */
  private mapS3Error(error: any): 'NOT_FOUND' | 'ACCESS_DENIED' | 'INVALID_KEY' | 'QUOTA_EXCEEDED' | 'NETWORK_ERROR' | 'UNKNOWN' {
    if (!error) return 'UNKNOWN';

    const statusCode = error.$metadata?.httpStatusCode;
    const errorName = error.name || error.Code;

    if (statusCode === 404 || errorName === 'NotFound' || errorName === 'NoSuchKey') {
      return 'NOT_FOUND';
    }

    if (statusCode === 403 || errorName === 'AccessDenied') {
      return 'ACCESS_DENIED';
    }

    if (errorName === 'InvalidKey' || errorName === 'KeyTooLong') {
      return 'INVALID_KEY';
    }

    if (errorName === 'QuotaExceeded' || errorName === 'ServiceUnavailable') {
      return 'QUOTA_EXCEEDED';
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return 'NETWORK_ERROR';
    }

    return 'UNKNOWN';
  }
}

/**
 * Create an S3 storage provider instance from environment variables.
 */
export function createS3StorageProvider(config?: Partial<S3StorageConfig>): S3StorageProvider {
  const envConfig: S3StorageConfig = {
    bucket: process.env.S3_BUCKET || 'field-network',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    serverSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION !== 'false',
    publicUrlBase: process.env.S3_PUBLIC_URL_BASE,
  };

  // Merge config with env, allowing config to override env values
  const finalConfig = {
    ...envConfig,
    ...config,
  };

  if (!finalConfig.accessKeyId || !finalConfig.secretAccessKey) {
    throw new Error('S3 credentials not configured. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY environment variables.');
  }

  return new S3StorageProvider(finalConfig);
}
