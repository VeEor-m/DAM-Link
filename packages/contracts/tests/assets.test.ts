import { describe, it, expect } from 'vitest';
import {
  AssetSchema,
  CreateAssetInputSchema,
  UpdateAssetInputSchema,
  AssetListQuerySchema,
  SidebarCountsSchema,
} from '../src/assets.js';

const validAsset = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  name: 'sunset.jpg',
  type: 'image' as const,
  format: 'jpg',
  size: 102400,
  mimeType: 'image/jpeg',
  uploadedAt: '2026-06-05T12:00:00.000Z',
  uploadedBy: '33333333-3333-4333-8333-333333333333',
  tags: ['nature', 'sky'],
  favorite: false,
  deletedAt: null,
  width: 1920,
  height: 1080,
  objectKey: 'orgs/22222222-2222-4222-8222-222222222222/2026/06/abc.jpg',
  thumbnailKey: 'orgs/.../thumb-abc.webp',
  status: 'ready' as const,
  visibility: 'org' as const,
};

describe('AssetSchema', () => {
  it('accepts a fully-populated valid asset', () => {
    expect(AssetSchema.parse(validAsset)).toEqual(validAsset);
  });

  it('rejects when name is empty', () => {
    expect(() => AssetSchema.parse({ ...validAsset, name: '' })).toThrow();
  });

  it('rejects when name exceeds 255 characters', () => {
    expect(() => AssetSchema.parse({ ...validAsset, name: 'a'.repeat(256) })).toThrow();
  });

  it('rejects when tags exceed 50 items', () => {
    expect(() =>
      AssetSchema.parse({ ...validAsset, tags: Array.from({ length: 51 }, (_, i) => `tag${i}`) }),
    ).toThrow();
  });

  it('accepts an asset with deletedAt: null', () => {
    const parsed = AssetSchema.parse({ ...validAsset, deletedAt: null });
    expect(parsed.deletedAt).toBeNull();
  });
});

describe('CreateAssetInputSchema', () => {
  it('defaults tags to []', () => {
    const parsed = CreateAssetInputSchema.parse({
      name: 'photo.png',
      type: 'image',
      format: 'png',
      mimeType: 'image/png',
      size: 2048,
      objectKey: 'orgs/.../photo.png',
    });
    expect(parsed.tags).toEqual([]);
  });

  it('rejects negative size', () => {
    expect(() =>
      CreateAssetInputSchema.parse({
        name: 'photo.png',
        type: 'image',
        format: 'png',
        mimeType: 'image/png',
        size: -1,
        objectKey: 'orgs/.../photo.png',
      }),
    ).toThrow();
  });
});

describe('UpdateAssetInputSchema', () => {
  it('allows partial update with only name', () => {
    expect(UpdateAssetInputSchema.parse({ name: 'renamed.jpg' })).toEqual({
      name: 'renamed.jpg',
    });
  });

  it('allows partial update with only tags', () => {
    expect(UpdateAssetInputSchema.parse({ tags: ['a', 'b'] })).toEqual({
      tags: ['a', 'b'],
    });
  });

  it('allows partial update with only favorite', () => {
    expect(UpdateAssetInputSchema.parse({ favorite: true })).toEqual({
      favorite: true,
    });
  });

  it('allows partial update with only visibility', () => {
    expect(UpdateAssetInputSchema.parse({ visibility: 'private' })).toEqual({
      visibility: 'private',
    });
  });
});

describe('AssetListQuerySchema', () => {
  it('parses comma-separated type into an array', () => {
    const parsed = AssetListQuerySchema.parse({ type: 'image,video' });
    expect(parsed.type).toEqual(['image', 'video']);
  });

  it('parses favorite: "true" → true', () => {
    const parsed = AssetListQuerySchema.parse({ favorite: 'true' });
    expect(parsed.favorite).toBe(true);
  });

  it('parses favorite: "false" → false', () => {
    const parsed = AssetListQuerySchema.parse({ favorite: 'false' });
    expect(parsed.favorite).toBe(false);
  });

  it('parses missing favorite as undefined', () => {
    const parsed = AssetListQuerySchema.parse({});
    expect(parsed.favorite).toBeUndefined();
  });

  it('defaults dateBucket to "all"', () => {
    const parsed = AssetListQuerySchema.parse({});
    expect(parsed.dateBucket).toBe('all');
  });

  it('defaults sort to "uploadedAt:desc"', () => {
    const parsed = AssetListQuerySchema.parse({});
    expect(parsed.sort).toBe('uploadedAt:desc');
  });

  it('defaults limit to 50 (inherited from PaginationInputSchema)', () => {
    const parsed = AssetListQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
  });

  it('rejects limit: 1000 (inherited clamp from PaginationInputSchema)', () => {
    expect(() => AssetListQuerySchema.parse({ limit: 1000 })).toThrow();
  });

  it('rejects unknown sort values', () => {
    expect(() => AssetListQuerySchema.parse({ sort: 'random:asc' })).toThrow();
  });

  it.each(['recent', 'favorites', 'trash'] as const)('accepts smart: %s', (smart) => {
    const parsed = AssetListQuerySchema.parse({ smart });
    expect(parsed.smart).toBe(smart);
  });

  it('rejects smart values outside the allowed set', () => {
    expect(() => AssetListQuerySchema.parse({ smart: 'archive' })).toThrow();
  });
});

describe('SidebarCountsSchema', () => {
  it('accepts a valid counts object', () => {
    const counts = {
      byType: {
        image: 10,
        video: 5,
        document: 3,
        audio: 1,
      },
      byTag: [
        { tag: 'nature', count: 4 },
        { tag: 'work', count: 2 },
      ],
      favorites: 7,
      trash: 2,
    };
    expect(SidebarCountsSchema.parse(counts)).toEqual(counts);
  });

  it('rejects negative counts in byType', () => {
    expect(() =>
      SidebarCountsSchema.parse({
        byType: {
          image: -1,
          video: 0,
          document: 0,
          audio: 0,
        },
        byTag: [],
        favorites: 0,
        trash: 0,
      }),
    ).toThrow();
  });
});
