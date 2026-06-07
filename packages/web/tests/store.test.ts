import { describe, it, expect } from 'vitest';
import { reducer } from '../src/state/reducer';
import { MOCK_ASSETS } from '../src/state/mockData';
import type { AppState, UIState } from '../src/state/types';

function makeUI(overrides: Partial<UIState> = {}): UIState {
  return {
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
    ...overrides,
  };
}

function makeState(ui: Partial<UIState> = {}, assets = MOCK_ASSETS): AppState {
  return { assets, ui: makeUI(ui) };
}

describe('reducer: initial UIState', () => {
  it('has selectedIds: [] on first build', () => {
    expect(makeState().ui.selectedIds).toEqual([]);
  });
});

describe('reducer: batch selection actions', () => {
  it('TOGGLE_BATCH_SELECT adds an id', () => {
    const next = reducer(makeState(), { type: 'TOGGLE_BATCH_SELECT', id: 'a01' });
    expect(next.ui.selectedIds).toEqual(['a01']);
  });

  it('TOGGLE_BATCH_SELECT removes an id that was already selected', () => {
    const s1 = reducer(makeState(), { type: 'TOGGLE_BATCH_SELECT', id: 'a01' });
    const s2 = reducer(s1, { type: 'TOGGLE_BATCH_SELECT', id: 'a02' });
    const s3 = reducer(s2, { type: 'TOGGLE_BATCH_SELECT', id: 'a01' });
    expect(s3.ui.selectedIds).toEqual(['a02']);
  });

  it('CLEAR_BATCH_SELECTION empties the array', () => {
    const s1 = reducer(makeState(), { type: 'TOGGLE_BATCH_SELECT', id: 'a01' });
    const s2 = reducer(s1, { type: 'TOGGLE_BATCH_SELECT', id: 'a02' });
    const s3 = reducer(s2, { type: 'CLEAR_BATCH_SELECTION' });
    expect(s3.ui.selectedIds).toEqual([]);
  });

  it('SELECT_ALL_VISIBLE replaces selectedIds with the provided list', () => {
    const next = reducer(makeState(), {
      type: 'SELECT_ALL_VISIBLE',
      ids: ['a01', 'a02', 'a03'],
    });
    expect(next.ui.selectedIds).toEqual(['a01', 'a02', 'a03']);
  });

  it('SELECT_ALL_VISIBLE with an empty list clears the selection', () => {
    const s1 = reducer(makeState(), { type: 'TOGGLE_BATCH_SELECT', id: 'a01' });
    const s2 = reducer(s1, { type: 'SELECT_ALL_VISIBLE', ids: [] });
    expect(s2.ui.selectedIds).toEqual([]);
  });
});

describe('reducer: SET_SORT', () => {
  it('initial UIState has sortKey=date and sortDir=desc', () => {
    expect(makeState().ui.sortKey).toBe('date');
    expect(makeState().ui.sortDir).toBe('desc');
  });

  it('SET_SORT updates sortKey and sortDir', () => {
    const next = reducer(makeState(), {
      type: 'SET_SORT',
      sortKey: 'name',
      sortDir: 'asc',
    });
    expect(next.ui.sortKey).toBe('name');
    expect(next.ui.sortDir).toBe('asc');
  });

  it('SET_SORT preserves all other UI fields', () => {
    const s1 = reducer(makeState({ searchQuery: 'foo', viewMode: 'list' }), {
      type: 'SET_SORT',
      sortKey: 'size',
      sortDir: 'asc',
    });
    expect(s1.ui.searchQuery).toBe('foo');
    expect(s1.ui.viewMode).toBe('list');
  });
});
