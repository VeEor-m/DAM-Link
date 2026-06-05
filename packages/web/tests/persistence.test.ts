import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadState, saveState, STORAGE_KEY } from '../src/state/persistence';
import type { AppState } from '../src/state/types';
import { MOCK_ASSETS } from '../src/state/mockData';

const state: AppState = {
  assets: MOCK_ASSETS,
  ui: {
    searchQuery: 'banner',
    selection: { kind: 'type', type: 'image' },
    viewMode: 'list',
    selectedAssetId: MOCK_ASSETS[0].id,
    filterPanelOpen: false,
    uploadDialogOpen: false,
    filter: {
      typeFilter: ['image'],
      formatFilter: [],
      sizeBucket: null,
      dateBucket: '30d',
      uploaderFilter: [],
    },
    selectedIds: [],
    sortKey: 'date',
    sortDir: 'desc',
  },
};

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no data', () => {
    expect(loadState()).toBeNull();
  });

  it('roundtrips state through localStorage', () => {
    vi.useFakeTimers();
    try {
      saveState(state);
      vi.advanceTimersByTime(300);
      const loaded = loadState();
      expect(loaded).toEqual(state);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null on corrupt data', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadState()).toBeNull();
  });

  it('returns null on shape mismatch', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ wrong: 'shape' }));
    expect(loadState()).toBeNull();
  });

  // Migration tests: a persisted state from a previous version of the
  // app may be missing fields that were added later (e.g. selectedIds
  // in T1, sortKey/sortDir in T6). loadState must fill in defaults so
  // the app doesn't crash reading .length on undefined.
  it('migrates a pre-T1 state by filling in selectedIds: []', () => {
    const oldShape = {
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
        // selectedIds, sortKey, sortDir intentionally missing
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldShape));
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.ui.selectedIds).toEqual([]);
    expect(loaded!.ui.sortKey).toBe('date');
    expect(loaded!.ui.sortDir).toBe('desc');
  });

  it('preserves user-chosen values when migrating (persisted value wins over default)', () => {
    const oldShape = {
      assets: MOCK_ASSETS,
      ui: {
        searchQuery: 'banner',
        selection: { kind: 'type', type: 'image' },
        viewMode: 'list',
        selectedAssetId: null,
        filterPanelOpen: false,
        uploadDialogOpen: false,
        filter: {
          typeFilter: ['image'],
          formatFilter: [],
          sizeBucket: null,
          dateBucket: '30d',
          uploaderFilter: [],
        },
        // new fields missing
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldShape));
    const loaded = loadState();
    expect(loaded!.ui.searchQuery).toBe('banner');
    expect(loaded!.ui.viewMode).toBe('list');
    expect(loaded!.ui.filter.dateBucket).toBe('30d');
    // ...and the new fields still got their defaults
    expect(loaded!.ui.sortKey).toBe('date');
  });

  it('fills in default filter sub-fields when the persisted filter is empty', () => {
    const oldShape = {
      assets: MOCK_ASSETS,
      ui: {
        searchQuery: '',
        selection: { kind: 'all' },
        viewMode: 'grid',
        selectedAssetId: null,
        filterPanelOpen: false,
        uploadDialogOpen: false,
        filter: {}, // all sub-fields missing
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldShape));
    const loaded = loadState();
    expect(loaded!.ui.filter).toEqual({
      typeFilter: [],
      formatFilter: [],
      sizeBucket: null,
      dateBucket: 'all',
      uploaderFilter: [],
    });
  });
});
