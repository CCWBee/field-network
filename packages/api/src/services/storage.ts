/**
 * Storage Service (Compatibility Layer)
 *
 * This file provides backward compatibility with the old storage API
 * while delegating to the new storage provider abstraction layer.
 *
 * For new code, prefer importing directly from './storage/index'.
 */

// Re-export everything from the new storage module
export * from './storage/index';

// Legacy exports for backward compatibility
import {
  getStorageProvider,
  generateUploadUrl as newGenerateUploadUrl,
  generateDownloadUrl as newGenerateDownloadUrl,
  uploadFile,
  downloadFile,
  deleteFile as newDeleteFile,
  deleteFiles,
  getFileHash as newGetFileHash,
  fileExists as newFileExists,
  validateUploadToken as newValidateUploadToken,
  consumeToken,
  LocalStorageProvider,
} from './storage/index';

/**
 * @deprecated Use generateUploadUrl from './storage' instead
 */
export async function getSignedUploadUrl(key: string, contentType: string, expiresIn?: number) {
  const result = await newGenerateUploadUrl(key, { contentType, expiresIn });
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to generate upload URL');
  }
  return {
    uploadUrl: result.data.uploadUrl,
    uploadId: result.data.uploadId,
  };
}

/**
 * @deprecated Use generateDownloadUrl from './storage' instead
 */
export async function getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string> {
  const result = await newGenerateDownloadUrl(key, { expiresIn });
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to generate download URL');
  }
  return result.data.downloadUrl;
}

/**
 * @deprecated Use validateUploadToken from './storage' instead
 */
export function validateUploadToken(uploadId: string): { key: string; contentType: string } | null {
  return newValidateUploadToken(uploadId);
}

/**
 * @deprecated Use consumeToken from './storage' instead
 */
export function consumeUploadToken(uploadId: string): void {
  consumeToken(uploadId);
}

/**
 * @deprecated Use uploadFile from './storage' instead
 */
export async function saveFile(key: string, data: Buffer): Promise<void> {
  const result = await uploadFile(key, data, 'application/octet-stream');
  if (!result.success) {
    throw new Error(result.error || 'Failed to save file');
  }
}

/**
 * @deprecated Use downloadFile from './storage' instead
 */
export async function readFile(key: string): Promise<Buffer | null> {
  const result = await downloadFile(key);
  if (!result.success) {
    return null;
  }
  return result.data || null;
}

/**
 * @deprecated Use getFileHash from './storage' instead
 */
export async function getFileHash(key: string): Promise<string | null> {
  return newGetFileHash(key);
}

/**
 * @deprecated Use deleteFile from './storage' instead
 */
export async function deleteFile(key: string): Promise<boolean> {
  const result = await newDeleteFile(key, { ignoreNotFound: true });
  return result.success;
}

/**
 * Delete multiple artefacts from storage
 * Used for cleanup when submissions are rejected or disputes resolved against worker
 */
export async function deleteArtefacts(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
  const result = await deleteFiles(keys, { ignoreNotFound: true });
  return {
    deleted: keys.filter(k => !result.data?.failed.includes(k)),
    failed: result.data?.failed || [],
  };
}

// Export the storage provider getter for routes that need direct access
export { getStorageProvider, LocalStorageProvider };
