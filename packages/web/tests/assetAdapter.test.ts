import { describe, it, expect } from 'vitest';
import { apiAssetToLocal } from '../src/state/assetAdapter';
import type { Asset as ApiAsset } from '@dam-link/contracts';

const baseApiAsset: ApiAsset = {
  id: 'a1',
  orgId: 'org-1',
  name: 'cat.png',
  type: 'image',
  format: 'PNG',
  size: 1024,
  mimeType: 'image/png',
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: 'u1',
  tags: ['cute'],
  favorite: false,
  deletedAt: null,
  width: 800,
  height: 600,
  duration: null,
  objectKey: 'originals/org-1/a1',
  thumbnailKey: 'thumbnails/org-1/a1.webp',
  thumbnailUrl: 'https://cdn/x.png?sig=abc',
  status: 'ready',
  visibility: 'private',
};

describe('apiAssetToLocal', () => {
  it('maps the 13 UI-shown fields from API shape to UI shape', () => {
    const local = apiAssetToLocal(baseApiAsset);
    expect(local).toEqual({
      id: 'a1',
      name: 'cat.png',
      type: 'image',
      format: 'PNG',
      size: 1024,
      uploadedAt: '2026-06-07T00:00:00.000Z',
      uploadedBy: 'u1',
      tags: ['cute'],
      favorite: false,
      deletedAt: null,
      width: 800,
      height: 600,
      duration: undefined,
      _thumbnailUrl: 'https://cdn/x.png?sig=abc',
    });
  });

  it('coerces null width/height/duration to undefined for optional-chaining safety', () => {
    const local = apiAssetToLocal({ ...baseApiAsset, width: null, height: null, duration: null });
    expect(local.width).toBeUndefined();
    expect(local.height).toBeUndefined();
    expect(local.duration).toBeUndefined();
  });

  it('preserves null thumbnailUrl as _thumbnailUrl: null (UI falls back to emoji)', () => {
    const local = apiAssetToLocal({ ...baseApiAsset, thumbnailUrl: null });
    expect(local._thumbnailUrl).toBeNull();
  });

  it('omits the 4 API-only fields (orgId, mimeType, objectKey, thumbnailKey, status, visibility, previewDataUrl) from the local shape', () => {
    const local = apiAssetToLocal(baseApiAsset) as unknown as Record<string, unknown>;
    expect('orgId' in local).toBe(false);
    expect('mimeType' in local).toBe(false);
    expect('objectKey' in local).toBe(false);
    expect('thumbnailKey' in local).toBe(false);
    expect('thumbnailUrl' in local).toBe(false);
    expect('status' in local).toBe(false);
    expect('visibility' in local).toBe(false);
    expect('previewDataUrl' in local).toBe(false);
  });
});
