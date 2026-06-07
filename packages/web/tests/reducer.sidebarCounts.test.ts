import { describe, it, expect } from 'vitest';
import { reducer } from '../src/state/reducer';
import type { AppState } from '../src/state/types';
import type { SidebarCounts } from '@dam-link/contracts';

function makeState(): AppState {
  return {
    assets: [],
    ui: {
      searchQuery: '',
      selection: { kind: 'all' },
      viewMode: 'grid',
      selectedAssetId: null,
      filterPanelOpen: false,
      uploadDialogOpen: false,
      filter: { typeFilter: [], formatFilter: [], sizeBucket: null, dateBucket: 'all', uploaderFilter: [] },
      selectedIds: [],
      sortKey: 'date',
      sortDir: 'desc',
      activeOrgId: 'org-1',
      sidebarCounts: null,
      lightboxAssetId: null,
    },
  };
}

const FAKE_COUNTS: SidebarCounts = {
  byType: { image: 3, video: 1, document: 0, audio: 0 },
  byTag: [{ tag: 'logo', count: 2 }],
  favorites: 1,
  trash: 4,
};

describe("reducer — SET_SIDEBAR_COUNTS", () => {
  it('replaces state.ui.sidebarCounts with the new value', () => {
    const s0 = makeState();
    const s1 = reducer(s0, { type: 'SET_SIDEBAR_COUNTS', counts: FAKE_COUNTS });
    expect(s1.ui.sidebarCounts).toEqual(FAKE_COUNTS);
  });

  it('does not mutate the input state', () => {
    const s0 = makeState();
    const snapshot = JSON.stringify(s0);
    reducer(s0, { type: 'SET_SIDEBAR_COUNTS', counts: FAKE_COUNTS });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('preserves unrelated ui fields', () => {
    const s0 = makeState();
    s0.ui.searchQuery = 'logo';
    s0.ui.activeOrgId = 'org-99';
    const s1 = reducer(s0, { type: 'SET_SIDEBAR_COUNTS', counts: FAKE_COUNTS });
    expect(s1.ui.searchQuery).toBe('logo');
    expect(s1.ui.activeOrgId).toBe('org-99');
  });
});
