/**
 * Image Processing Service
 *
 * Extracts EXIF metadata, dimensions, and GPS data from uploaded images.
 * Uses sharp for image processing and exif-reader for EXIF parsing.
 */

import sharp from 'sharp';
import exifReader from 'exif-reader';

export interface ExifData {
  width: number;
  height: number;
  gpsLat: number | null;
  gpsLon: number | null;
  bearingDeg: number | null;
  capturedAt: Date | null;
  exifJson: Record<string, unknown>;
}

/**
 * Convert GPS coordinates from EXIF format (degrees, minutes, seconds) to decimal
 */
function gpsToDecimal(
  coords: number[] | undefined,
  ref: string | undefined
): number | null {
  if (!coords || coords.length < 3) return null;

  const [degrees, minutes, seconds] = coords;
  let decimal = degrees + minutes / 60 + seconds / 3600;

  // South and West are negative
  if (ref === 'S' || ref === 'W') {
    decimal = -decimal;
  }

  return decimal;
}

/**
 * Extract EXIF metadata from an image buffer
 */
export async function extractExifData(buffer: Buffer): Promise<ExifData> {
  const result: ExifData = {
    width: 0,
    height: 0,
    gpsLat: null,
    gpsLon: null,
    bearingDeg: null,
    capturedAt: null,
    exifJson: {},
  };

  try {
    // Get image metadata using sharp
    const metadata = await sharp(buffer).metadata();

    result.width = metadata.width || 0;
    result.height = metadata.height || 0;

    // Parse EXIF data if available
    if (metadata.exif) {
      try {
        const exif = exifReader(metadata.exif);
        result.exifJson = JSON.parse(JSON.stringify(exif)); // Deep clone for serialization

        // Extract GPS coordinates
        if (exif.GPSInfo) {
          const gpsInfo = exif.GPSInfo;

          // Latitude
          if (gpsInfo.GPSLatitude && gpsInfo.GPSLatitudeRef) {
            result.gpsLat = gpsToDecimal(
              gpsInfo.GPSLatitude as number[],
              gpsInfo.GPSLatitudeRef as string
            );
          }

          // Longitude
          if (gpsInfo.GPSLongitude && gpsInfo.GPSLongitudeRef) {
            result.gpsLon = gpsToDecimal(
              gpsInfo.GPSLongitude as number[],
              gpsInfo.GPSLongitudeRef as string
            );
          }

          // Image direction (bearing)
          if (gpsInfo.GPSImgDirection !== undefined) {
            result.bearingDeg = gpsInfo.GPSImgDirection as number;
          }
        }

        // Extract capture timestamp
        if (exif.Photo?.DateTimeOriginal) {
          const dt = exif.Photo.DateTimeOriginal;
          result.capturedAt = dt instanceof Date ? dt : new Date(dt as unknown as string);
        } else if (exif.Image?.DateTime) {
          const dt = exif.Image.DateTime;
          result.capturedAt = dt instanceof Date ? dt : new Date(dt as unknown as string);
        }
      } catch (exifError) {
        // EXIF parsing failed, continue with dimensions only
        console.warn('EXIF parsing failed:', exifError);
      }
    }
  } catch (error) {
    console.error('Image processing failed:', error);
    throw new Error('Failed to process image');
  }

  return result;
}

/**
 * Validate image dimensions against task requirements
 */
export function validateImageDimensions(
  width: number,
  height: number,
  minWidth = 640,
  minHeight = 480
): { valid: boolean; message?: string } {
  if (width < minWidth || height < minHeight) {
    return {
      valid: false,
      message: `Image dimensions ${width}x${height} are below minimum ${minWidth}x${minHeight}`,
    };
  }
  return { valid: true };
}
