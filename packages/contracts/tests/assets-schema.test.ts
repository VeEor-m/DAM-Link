import { describe, it, expect } from 'vitest';
import { AssetSchema } from '../src/assets.js';

const baseAsset = {
  id: '00000000-0000-4000-8000-000000000001',
  orgId: '00000000-0000-4000-8000-000000000002',
  name: 'clip.mp4',
  type: 'video' as const,
  format: 'MP4',
  size: 1024,
  mimeType: 'video/mp4',
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: '00000000-0000-4000-8000-000000000003',
  tags: [],
  favorite: false,
  deletedAt: null,
  objectKey: 'orgs/00000000-0000-4000-8000-000000000002/originals/clip.mp4',
  status: 'ready' as const,
  visibility: 'org' as const,
};

describe('AssetSchema.posterUrl', () => {
  it('accepts a valid presigned URL', () => {
    const parsed = AssetSchema.parse({
      ...baseAsset,
      posterUrl: 'https://cdn.example.com/poster.jpg?sig=abc',
    });
    expect(parsed.posterUrl).toBe('https://cdn.example.com/poster.jpg?sig=abc');
  });

  it('accepts null', () => {
    const parsed = AssetSchema.parse({ ...baseAsset, posterUrl: null });
    expect(parsed.posterUrl).toBeNull();
  });

  it('is optional (omitted)', () => {
    const parsed = AssetSchema.parse(baseAsset);
    expect(parsed.posterUrl).toBeUndefined();
  });

  it('rejects a non-URL string', () => {
    expect(() => AssetSchema.parse({ ...baseAsset, posterUrl: 'not-a-url' })).toThrow();
  });
});
