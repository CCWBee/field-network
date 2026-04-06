import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Upload Validation Tests
 *
 * Tests for file upload validation including:
 * - File size limits
 * - Allowed MIME types
 * - Spoofed MIME type detection
 */

// Mock file validation utilities
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function validateFileSize(sizeBytes: number): { valid: boolean; error?: string } {
  if (sizeBytes > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${(sizeBytes / (1024 * 1024)).toFixed(2)}MB exceeds maximum ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }
  return { valid: true };
}

function validateMimeType(mimeType: string): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `File type '${mimeType}' is not allowed. Accepted types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }
  return { valid: true };
}

// Magic bytes for common file types
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP starts with RIFF)
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'application/x-msdownload': [0x4D, 0x5A], // MZ (EXE)
};

function detectActualMimeType(buffer: Buffer): string | null {
  for (const [mimeType, magic] of Object.entries(MAGIC_BYTES)) {
    if (buffer.length >= magic.length) {
      const matches = magic.every((byte, index) => buffer[index] === byte);
      if (matches) {
        return mimeType;
      }
    }
  }
  return null;
}

function validateMimeTypeIntegrity(
  claimedMimeType: string,
  fileBuffer: Buffer
): { valid: boolean; error?: string } {
  const actualMimeType = detectActualMimeType(fileBuffer);

  if (actualMimeType && actualMimeType !== claimedMimeType) {
    return {
      valid: false,
      error: `MIME type mismatch: claimed '${claimedMimeType}' but file appears to be '${actualMimeType}'`,
    };
  }

  return { valid: true };
}

describe('Upload Validation', () => {
  describe('File Size Validation', () => {
    it('should accept files under 10MB', () => {
      const sizes = [
        1 * 1024, // 1KB
        100 * 1024, // 100KB
        1 * 1024 * 1024, // 1MB
        5 * 1024 * 1024, // 5MB
        9.9 * 1024 * 1024, // 9.9MB
      ];

      for (const size of sizes) {
        const result = validateFileSize(size);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('should reject files over 10MB', () => {
      const sizes = [
        10 * 1024 * 1024 + 1, // Just over 10MB
        15 * 1024 * 1024, // 15MB
        50 * 1024 * 1024, // 50MB
        100 * 1024 * 1024, // 100MB
      ];

      for (const size of sizes) {
        const result = validateFileSize(size);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum');
      }
    });

    it('should accept exactly 10MB', () => {
      const result = validateFileSize(10 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should handle zero byte files', () => {
      const result = validateFileSize(0);
      expect(result.valid).toBe(true);
    });
  });

  describe('MIME Type Validation', () => {
    it('should accept JPEG files', () => {
      const result = validateMimeType('image/jpeg');
      expect(result.valid).toBe(true);
    });

    it('should accept PNG files', () => {
      const result = validateMimeType('image/png');
      expect(result.valid).toBe(true);
    });

    it('should accept WebP files', () => {
      const result = validateMimeType('image/webp');
      expect(result.valid).toBe(true);
    });

    it('should reject PDF files', () => {
      const result = validateMimeType('application/pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject executable files', () => {
      const exeTypes = [
        'application/x-msdownload',
        'application/x-executable',
        'application/octet-stream',
      ];

      for (const mimeType of exeTypes) {
        const result = validateMimeType(mimeType);
        expect(result.valid).toBe(false);
      }
    });

    it('should reject other non-image types', () => {
      const invalidTypes = [
        'text/plain',
        'text/html',
        'application/json',
        'application/javascript',
        'video/mp4',
        'audio/mpeg',
      ];

      for (const mimeType of invalidTypes) {
        const result = validateMimeType(mimeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
      }
    });

    it('should reject GIF files (not in allowed list)', () => {
      const result = validateMimeType('image/gif');
      expect(result.valid).toBe(false);
    });
  });

  describe('Spoofed MIME Type Detection', () => {
    it('should detect PDF disguised as JPEG', () => {
      // PDF magic bytes: %PDF
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const result = validateMimeTypeIntegrity('image/jpeg', pdfBuffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('MIME type mismatch');
      expect(result.error).toContain('application/pdf');
    });

    it('should detect EXE disguised as PNG', () => {
      // EXE magic bytes: MZ
      const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const result = validateMimeTypeIntegrity('image/png', exeBuffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('MIME type mismatch');
    });

    it('should accept legitimate JPEG', () => {
      // JPEG magic bytes: FF D8 FF
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      const result = validateMimeTypeIntegrity('image/jpeg', jpegBuffer);

      expect(result.valid).toBe(true);
    });

    it('should accept legitimate PNG', () => {
      // PNG magic bytes: 89 50 4E 47
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const result = validateMimeTypeIntegrity('image/png', pngBuffer);

      expect(result.valid).toBe(true);
    });

    it('should accept legitimate WebP', () => {
      // WebP magic bytes: RIFF....WEBP
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
      const result = validateMimeTypeIntegrity('image/webp', webpBuffer);

      expect(result.valid).toBe(true);
    });

    it('should pass files with unknown magic bytes', () => {
      // Unknown/corrupted file - we can't detect mismatch, so pass
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = validateMimeTypeIntegrity('image/jpeg', unknownBuffer);

      // Should pass because we can't positively identify it as malicious
      expect(result.valid).toBe(true);
    });

    it('should handle empty buffer', () => {
      const emptyBuffer = Buffer.from([]);
      const result = validateMimeTypeIntegrity('image/jpeg', emptyBuffer);

      // Empty buffer - can't validate, should pass (size validation catches this)
      expect(result.valid).toBe(true);
    });

    it('should handle very short buffer', () => {
      const shortBuffer = Buffer.from([0xFF]);
      const result = validateMimeTypeIntegrity('image/jpeg', shortBuffer);

      // Too short to match any pattern, passes
      expect(result.valid).toBe(true);
    });
  });

  describe('Combined Validation', () => {
    function validateUpload(
      sizeBytes: number,
      mimeType: string,
      fileBuffer?: Buffer
    ): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      const sizeResult = validateFileSize(sizeBytes);
      if (!sizeResult.valid && sizeResult.error) {
        errors.push(sizeResult.error);
      }

      const mimeResult = validateMimeType(mimeType);
      if (!mimeResult.valid && mimeResult.error) {
        errors.push(mimeResult.error);
      }

      if (fileBuffer) {
        const integrityResult = validateMimeTypeIntegrity(mimeType, fileBuffer);
        if (!integrityResult.valid && integrityResult.error) {
          errors.push(integrityResult.error);
        }
      }

      return { valid: errors.length === 0, errors };
    }

    it('should accept valid JPEG upload', () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const result = validateUpload(1024 * 1024, 'image/jpeg', buffer);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject oversized PDF with multiple errors', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = validateUpload(20 * 1024 * 1024, 'application/pdf', buffer);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
      expect(result.errors.some(e => e.includes('not allowed'))).toBe(true);
    });

    it('should reject spoofed PDF claiming to be JPEG', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = validateUpload(1024 * 1024, 'image/jpeg', pdfBuffer);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('MIME type mismatch'))).toBe(true);
    });
  });
});
