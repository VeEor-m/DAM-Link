import { describe, it, expect } from 'vitest';
import { selectLightboxVisibleAssetIds, PREVIEWABLE_ASSET_TYPES } from '../src/state/selectors';
import type { AppState, Asset } from '../src/state/types';
import { initialUI } from '../src/state/initialUI';

const img: Asset = {
  id: 'img1', orgId: 'o', name: 'hero.png', type: 'image', format: 'PNG', size: 0,
  uploadedAt: '', uploadedBy: 'u', tags: [], favorite: false, deletedAt: null,
};
const vid: Asset = { ...img, id: 'vid1', type: 'video', format: 'MP4' };
const doc: Asset = { ...img, id: 'doc1', type: 'document', format: 'TXT' };
const aud: Asset = { ...img, id: 'aud1', type: 'audio', format: 'MP3' };

describe('PREVIEWABLE_ASSET_TYPES', () => {
  it('contains exactly image and video', () => {
    expect([...PREVIEWABLE_ASSET_TYPES].sort()).toEqual(['image', 'video']);
  });
});

describe('selectLightboxVisibleAssetIds', () => {
  it('returns all ids when all assets are previewable (image/video)', () => {
    const s: AppState = { assets: [img, vid], ui: initialUI };
    expect(selectLightboxVisibleAssetIds(s)).toEqual(['img1', 'vid1']);
  });

  it('drops document and audio ids so the lightbox can never navigate to them', () => {
    // Mixed list: image, document, video, audio — the same shape the user
    // saw in the "Self-Test" screenshot (5 visible assets of which 2
    // were image/video and 3 were document/audio). Before the fix the
    // lightbox's prev/next chain walked into the document and rendered
    // an empty MediaStage (no case for asset.type === 'document').
    const s: AppState = { assets: [img, doc, vid, aud], ui: initialUI };
    expect(selectLightboxVisibleAssetIds(s)).toEqual(['img1', 'vid1']);
  });

  it('returns the empty list when no asset is previewable', () => {
    const s: AppState = { assets: [doc, aud], ui: initialUI };
    expect(selectLightboxVisibleAssetIds(s)).toEqual([]);
  });

  it('preserves the display order of selectVisibleAssetIds', () => {
    // Visible assets are in display order; lightbox-filtered should be
    // a subset in the same order (used by NeighborStrip + prev/next).
    const s: AppState = { assets: [vid, doc, img, aud], ui: initialUI };
    expect(selectLightboxVisibleAssetIds(s)).toEqual(['vid1', 'img1']);
  });

  it('excludes trashed assets (delegates to the underlying selection)', () => {
    const trashedVid: Asset = { ...vid, deletedAt: '2026-06-07T00:00:00.000Z' };
    const s: AppState = { assets: [img, trashedVid], ui: initialUI };
    expect(selectLightboxVisibleAssetIds(s)).toEqual(['img1']);
  });
});
