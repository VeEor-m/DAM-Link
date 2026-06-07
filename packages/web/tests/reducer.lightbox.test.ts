import { describe, it, expect } from 'vitest';
import { reducer } from '../src/state/reducer';
import { initialUI } from '../src/state/initialUI';
import type { AppState, Asset } from '../src/state/types';

const asset: Asset = {
  id: '1', name: 'A', type: 'image', format: 'PNG', size: 0,
  uploadedAt: '', uploadedBy: 'u', tags: [], favorite: false, deletedAt: null,
};
const start: AppState = { assets: [asset], ui: { ...initialUI, selectedAssetId: null, lightboxAssetId: null } };

describe('reducer: lightbox', () => {
  it('OPEN_LIGHTBOX sets both lightboxAssetId and selectedAssetId', () => {
    const s = reducer(start, { type: 'OPEN_LIGHTBOX', assetId: '1' });
    expect(s.ui.lightboxAssetId).toBe('1');
    expect(s.ui.selectedAssetId).toBe('1');
  });

  it('CLOSE_LIGHTBOX clears lightboxAssetId but keeps selectedAssetId', () => {
    const opened = reducer(start, { type: 'OPEN_LIGHTBOX', assetId: '1' });
    const closed = reducer(opened, { type: 'CLOSE_LIGHTBOX' });
    expect(closed.ui.lightboxAssetId).toBeNull();
    expect(closed.ui.selectedAssetId).toBe('1');
  });

  it('LIGHTBOX_NAVIGATE sets both ids atomically', () => {
    const b: Asset = { ...asset, id: '2' };
    const state: AppState = { assets: [asset, b], ui: { ...initialUI, selectedAssetId: '1', lightboxAssetId: '1' } };
    const s = reducer(state, { type: 'LIGHTBOX_NAVIGATE', assetId: '2' });
    expect(s.ui.lightboxAssetId).toBe('2');
    expect(s.ui.selectedAssetId).toBe('2');
  });

  it('OPEN_LIGHTBOX does not mutate state', () => {
    const original = JSON.stringify(start);
    reducer(start, { type: 'OPEN_LIGHTBOX', assetId: '1' });
    expect(JSON.stringify(start)).toBe(original);
  });
});
