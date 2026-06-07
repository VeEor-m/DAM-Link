import { describe, it, expect } from 'vitest';
import { selectVisibleAssetIds } from '../src/state/selectors';
import type { AppState, Asset } from '../src/state/types';
import { initialUI } from '../src/state/initialUI';

const assets: Asset[] = [
  {
    id: 'a',
    orgId: 'org-1',
    name: 'A',
    type: 'image',
    format: 'PNG',
    size: 0,
    uploadedAt: '',
    uploadedBy: 'u',
    tags: [],
    favorite: false,
    deletedAt: null,
  },
  {
    id: 'b',
    orgId: 'org-1',
    name: 'B',
    type: 'video',
    format: 'MP4',
    size: 0,
    uploadedAt: '',
    uploadedBy: 'u',
    tags: [],
    favorite: false,
    deletedAt: null,
  },
];

describe('selectVisibleAssetIds', () => {
  it('returns ids in display order', () => {
    const s: AppState = { assets, ui: initialUI };
    expect(selectVisibleAssetIds(s)).toEqual(['a', 'b']);
  });

  it('excludes trashed assets by default', () => {
    const trash: Asset = { ...assets[1], deletedAt: '2026-06-07T00:00:00.000Z' };
    const s: AppState = { assets: [assets[0], trash], ui: initialUI };
    expect(selectVisibleAssetIds(s)).toEqual(['a']);
  });
});
