import { describe, it, expect } from 'vitest';
import { deleteAsset, restoreAsset, permanentDelete, emptyTrash } from '../src/state/assetOps';
import { MOCK_ASSETS } from '../src/state/mockData';
import type { AppState } from '../src/state/types';

const baseState: AppState = {
  assets: MOCK_ASSETS,
  ui: {
    searchQuery: '',
    selection: { kind: 'all' },
    viewMode: 'grid',
    selectedAssetId: null,
    filterPanelOpen: false,
    uploadDialogOpen: false,
    filter: {
      typeFilter: [],
      formatFilter: [],
      sizeBucket: null,
      dateBucket: 'all',
      uploaderFilter: [],
    },
    selectedIds: [],
    sortKey: 'date',
    sortDir: 'desc',
    activeOrgId: null,
    sidebarCounts: null,
    lightboxAssetId: null,
  },
};

describe('assetOps', () => {
  it('deleteAsset sets deletedAt to now', () => {
    const { nextState, undo } = deleteAsset(baseState, 'a01', new Date('2026-06-04T00:00:00Z'));
    const asset = nextState.assets.find((a) => a.id === 'a01')!;
    expect(asset.deletedAt).toBe('2026-06-04T00:00:00Z');
    expect(undo!.asset.deletedAt).toBeNull();
  });

  it('restoreAsset clears deletedAt', () => {
    const trashed = { ...baseState, assets: baseState.assets.map((a) =>
      a.id === 'a01' ? { ...a, deletedAt: '2026-06-01' } : a,
    )};
    const { nextState } = restoreAsset(trashed, 'a01');
    const asset = nextState.assets.find((a) => a.id === 'a01')!;
    expect(asset.deletedAt).toBeNull();
  });

  it('permanentDelete removes the asset', () => {
    const { nextState } = permanentDelete(baseState, 'a01');
    expect(nextState.assets.find((a) => a.id === 'a01')).toBeUndefined();
  });

  it('emptyTrash removes all trashed assets', () => {
    const { nextState } = emptyTrash(baseState);
    expect(nextState.assets.every((a) => a.deletedAt === null)).toBe(true);
  });
});
