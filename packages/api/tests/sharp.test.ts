import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { generateThumbnail, probeImage, isProcessableImageMime } from '../src/lib/sharp.js';

const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('isProcessableImageMime', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'])(
    'returns true for %s',
    (m) => {
      expect(isProcessableImageMime(m)).toBe(true);
    },
  );
  it.each(['image/svg+xml', 'video/mp4', 'application/pdf'])(
    'returns false for %s',
    (m) => {
      expect(isProcessableImageMime(m)).toBe(false);
    },
  );
});

describe('probeImage', () => {
  it('returns width and height for a valid PNG', async () => {
    const meta = await probeImage(RED_PNG);
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  it('rejects non-image buffers', async () => {
    await expect(probeImage(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('generateThumbnail', () => {
  it('produces a WebP buffer at <= 320x320', async () => {
    const big = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: { r: 0, g: 128, b: 255 } },
    }).png().toBuffer();
    const out = await generateThumbnail(big);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(320);
  });

  it('strips EXIF metadata (output has no exif segment)', async () => {
    const out = await generateThumbnail(RED_PNG);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
