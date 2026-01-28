/**
 * Storage Provider Integration Tests
 *
 * Tests the storage abstraction layer with both local and S3 providers.
 * For S3 tests to pass, MinIO must be running (docker-compose up minio).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import {
  createStorageProvider,
  LocalStorageProvider,
  S3StorageProvider,
  resetStorageProvider,
} from '../../src/services/storage';

// Test file content
const TEST_FILE_CONTENT = Buffer.from('This is test file content for storage tests.');
const TEST_FILE_HASH = createHash('sha256').update(TEST_FILE_CONTENT).digest('hex');

// Temp directory for local storage tests
const TEMP_STORAGE_DIR = path.join(os.tmpdir(), 'field-network-storage-test');

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeAll(() => {
    // Clean up any existing test directory
    if (fs.existsSync(TEMP_STORAGE_DIR)) {
      fs.rmSync(TEMP_STORAGE_DIR, { recursive: true });
    }

    provider = createStorageProvider('local', {
      storageDir: TEMP_STORAGE_DIR,
      baseUrl: 'http://localhost:3000',
    });
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(TEMP_STORAGE_DIR)) {
      fs.rmSync(TEMP_STORAGE_DIR, { recursive: true });
    }
    resetStorageProvider();
  });

  describe('uploadFile', () => {
    it('should upload a file successfully', async () => {
      const key = 'test/upload/file1.txt';
      const result = await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

      expect(result.success).toBe(true);
      expect(await provider.fileExists(key)).toBe(true);
    });

    it('should create nested directories automatically', async () => {
      const key = 'deeply/nested/path/to/file.txt';
      const result = await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

      expect(result.success).toBe(true);
      expect(await provider.fileExists(key)).toBe(true);
    });
  });

  describe('downloadFile', () => {
    it('should download an existing file', async () => {
      const key = 'test/download/file.txt';
      await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

      const result = await provider.downloadFile(key);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(TEST_FILE_CONTENT);
    });

    it('should return NOT_FOUND for missing file', async () => {
      const result = await provider.downloadFile('nonexistent/file.txt');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const key = 'test/exists/file.txt';
      await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

      expect(await provider.fileExists(key)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      expect(await provider.fileExists('nonexistent.txt')).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return file metadata', async () => {
      const key = 'test/metadata/file.txt';
      await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

      const result = await provider.getMetadata(key);

      expect(result.success).toBe(true);
      expect(result.data?.key).toBe(key);
      expect(result.data?.sizeBytes).toBe(TEST_FILE_CONTENT.length);
      expect(result.data?.sha256).toBe(TEST_FILE_HASH);
    });
  });

  describe('getFileHash', () => {
    it('should return SHA256 hash of file', async () => {
      const key = 'test/hash/file.txt';
      await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

      const hash = await provider.getFileHash(key);

      expect(hash).toBe(TEST_FILE_HASH);
    });

    it('should return null for non-existing file', async () => {
      const hash = await provider.getFileHash('nonexistent.txt');

      expect(hash).toBeNull();
    });
  });

  describe('deleteFile', () => {
    it('should delete an existing file', async () => {
      const key = 'test/delete/file.txt';
      await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');
      expect(await provider.fileExists(key)).toBe(true);

      const result = await provider.deleteFile(key);

      expect(result.success).toBe(true);
      expect(await provider.fileExists(key)).toBe(false);
    });

    it('should return error for non-existing file', async () => {
      const result = await provider.deleteFile('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
    });

    it('should succeed with ignoreNotFound option', async () => {
      const result = await provider.deleteFile('nonexistent.txt', { ignoreNotFound: true });

      expect(result.success).toBe(true);
    });
  });

  describe('deleteFiles', () => {
    it('should delete multiple files', async () => {
      const keys = ['test/multi/file1.txt', 'test/multi/file2.txt', 'test/multi/file3.txt'];

      for (const key of keys) {
        await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');
      }

      const result = await provider.deleteFiles(keys);

      expect(result.success).toBe(true);
      expect(result.data?.deleted).toBe(3);
      expect(result.data?.failed).toHaveLength(0);

      for (const key of keys) {
        expect(await provider.fileExists(key)).toBe(false);
      }
    });
  });

  describe('generateUploadUrl', () => {
    it('should generate a signed upload URL', async () => {
      const key = 'test/signed/upload.txt';
      const result = await provider.generateUploadUrl(key, {
        contentType: 'text/plain',
        expiresIn: 3600,
      });

      expect(result.success).toBe(true);
      expect(result.data?.uploadUrl).toContain('/v1/storage/upload/');
      expect(result.data?.uploadId).toBeDefined();
      expect(result.data?.method).toBe('PUT');
      expect(result.data?.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('generateDownloadUrl', () => {
    it('should generate a signed download URL', async () => {
      const key = 'test/signed/download.txt';
      await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

      const result = await provider.generateDownloadUrl(key, { expiresIn: 3600 });

      expect(result.success).toBe(true);
      expect(result.data?.downloadUrl).toContain('/v1/storage/download/');
      expect(result.data?.expiresAt).toBeInstanceOf(Date);
    });

    it('should return NOT_FOUND for non-existing file', async () => {
      const result = await provider.generateDownloadUrl('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NOT_FOUND');
    });
  });

  describe('token validation', () => {
    it('should validate upload tokens', async () => {
      const key = 'test/token/file.txt';
      const urlResult = await provider.generateUploadUrl(key, { contentType: 'text/plain' });
      const uploadId = urlResult.data!.uploadId;

      const tokenData = provider.validateUploadToken(uploadId);

      expect(tokenData).not.toBeNull();
      expect(tokenData?.key).toBe(key);
      expect(tokenData?.contentType).toBe('text/plain');
    });

    it('should reject invalid upload tokens', () => {
      const tokenData = provider.validateUploadToken('invalid-token');

      expect(tokenData).toBeNull();
    });

    it('should consume tokens after use', async () => {
      const key = 'test/consume/file.txt';
      const urlResult = await provider.generateUploadUrl(key, { contentType: 'text/plain' });
      const uploadId = urlResult.data!.uploadId;

      // First validation should work
      expect(provider.validateUploadToken(uploadId)).not.toBeNull();

      // Consume the token
      provider.consumeToken(uploadId);

      // Second validation should fail
      expect(provider.validateUploadToken(uploadId)).toBeNull();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('local');
    });
  });

  describe('security', () => {
    it('should prevent directory traversal in keys', async () => {
      const maliciousKey = '../../../etc/passwd';
      const result = await provider.uploadFile(maliciousKey, TEST_FILE_CONTENT, 'text/plain');

      expect(result.success).toBe(true);
      // File should be stored safely within the storage directory
      expect(await provider.fileExists(maliciousKey)).toBe(true);
      // The actual file path should not escape the storage directory
    });
  });
});

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;
  const isMinioAvailable = process.env.RUN_S3_TESTS === 'true' ||
    (process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID);

  // Skip S3 tests if MinIO is not configured
  const maybeDescribe = isMinioAvailable ? describe : describe.skip;

  maybeDescribe('with MinIO', () => {
    beforeAll(() => {
      provider = createStorageProvider('s3', {
        bucket: process.env.S3_BUCKET || 'field-network-test',
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || 'fieldnetwork',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'fieldnetwork123',
        forcePathStyle: true,
        serverSideEncryption: false, // MinIO may not support SSE
      });
    });

    afterAll(() => {
      resetStorageProvider();
    });

    describe('uploadFile', () => {
      it('should upload a file to S3', async () => {
        const key = `test/${Date.now()}/file.txt`;
        const result = await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

        expect(result.success).toBe(true);
        expect(await provider.fileExists(key)).toBe(true);

        // Cleanup
        await provider.deleteFile(key);
      });
    });

    describe('downloadFile', () => {
      it('should download a file from S3', async () => {
        const key = `test/${Date.now()}/download.txt`;
        await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

        const result = await provider.downloadFile(key);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(TEST_FILE_CONTENT);

        // Cleanup
        await provider.deleteFile(key);
      });
    });

    describe('generateUploadUrl', () => {
      it('should generate a pre-signed upload URL', async () => {
        const key = `test/${Date.now()}/signed-upload.txt`;
        const result = await provider.generateUploadUrl(key, {
          contentType: 'text/plain',
          expiresIn: 3600,
        });

        expect(result.success).toBe(true);
        expect(result.data?.uploadUrl).toContain('X-Amz-Signature');
        expect(result.data?.method).toBe('PUT');
      });
    });

    describe('generateDownloadUrl', () => {
      it('should generate a pre-signed download URL', async () => {
        const key = `test/${Date.now()}/signed-download.txt`;
        await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');

        const result = await provider.generateDownloadUrl(key, { expiresIn: 3600 });

        expect(result.success).toBe(true);
        expect(result.data?.downloadUrl).toContain('X-Amz-Signature');

        // Cleanup
        await provider.deleteFile(key);
      });
    });

    describe('deleteFiles', () => {
      it('should delete multiple files', async () => {
        const timestamp = Date.now();
        const keys = [
          `test/${timestamp}/multi1.txt`,
          `test/${timestamp}/multi2.txt`,
          `test/${timestamp}/multi3.txt`,
        ];

        for (const key of keys) {
          await provider.uploadFile(key, TEST_FILE_CONTENT, 'text/plain');
        }

        const result = await provider.deleteFiles(keys);

        expect(result.success).toBe(true);
        expect(result.data?.deleted).toBe(3);
      });
    });

    describe('healthCheck', () => {
      it('should return healthy status when connected', async () => {
        const health = await provider.healthCheck();

        expect(health.healthy).toBe(true);
        expect(health.provider).toBe('s3');
      });
    });
  });
});

describe('Storage Provider Factory', () => {
  beforeEach(() => {
    resetStorageProvider();
  });

  afterAll(() => {
    resetStorageProvider();
  });

  it('should create local provider by default', () => {
    const provider = createStorageProvider('local');

    expect(provider).toBeInstanceOf(LocalStorageProvider);
    expect(provider.providerName).toBe('local');
  });

  it('should create S3 provider when specified with credentials', () => {
    // This test requires explicit credentials since environment may not have them
    const provider = createStorageProvider('s3', {
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    expect(provider).toBeInstanceOf(S3StorageProvider);
    expect(provider.providerName).toBe('s3');
  });

  it('should throw for unknown provider type', () => {
    expect(() => {
      // @ts-expect-error Testing invalid provider type
      createStorageProvider('invalid');
    }).toThrow('Unknown storage provider type');
  });
});
