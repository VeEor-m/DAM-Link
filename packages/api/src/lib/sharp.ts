import sharp from 'sharp';

const THUMB_MAX_DIM = 320;
const THUMB_QUALITY = 80;

const PROCESSABLE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

export function isProcessableImageMime(mime: string): boolean {
  return PROCESSABLE.has(mime);
}

export interface ImageProbe {
  width: number;
  height: number;
  format: string | undefined;
}

/** Read the image's width/height without decoding pixels. */
export async function probeImage(buffer: Buffer): Promise<ImageProbe> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('probeImage: could not read dimensions');
  }
  return { width: meta.width, height: meta.height, format: meta.format };
}

/**
 * Generate a thumbnail buffer (WebP, max dim 320px, EXIF stripped).
 * Always fits inside a 320x320 box preserving aspect ratio.
 */
export async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // honour EXIF orientation
    .resize({
      width: THUMB_MAX_DIM,
      height: THUMB_MAX_DIM,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    // sharp's default strips all metadata; no withMetadata() call needed.
    .toBuffer();
}
