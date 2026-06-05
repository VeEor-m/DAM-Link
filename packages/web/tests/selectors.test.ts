import { describe, it, expect } from 'vitest';
import {
  matchesSearch,
  matchesFilters,
  isInSelection,
  selectVisibleAssets,
  selectSidebarCounts,
  selectActiveFilterCount,
} from '../src/state/selectors';
import { MOCK_ASSETS } from '../src/state/mockData';
import type { FilterState } from '../src/state/types';

const emptyFilter: FilterState = {
  typeFilter: [],
  formatFilter: [],
  sizeBucket: null,
  dateBucket: 'all',
  uploaderFilter: [],
};

describe('matchesSearch', () => {
  it('matches name (case-insensitive)', () => {
    const a = MOCK_ASSETS[0];
    expect(matchesSearch(a, 'BANNER')).toBe(true);
    expect(matchesSearch(a, 'nope')).toBe(false);
  });
  it('matches format', () => {
    expect(matchesSearch(MOCK_ASSETS[0], 'png')).toBe(true);
  });
  it('matches uploader', () => {
    expect(matchesSearch(MOCK_ASSETS[0], '张三')).toBe(true);
  });
  it('matches tag', () => {
    expect(matchesSearch(MOCK_ASSETS[0], '品牌物料')).toBe(true);
  });
  it('returns true for empty query', () => {
    expect(matchesSearch(MOCK_ASSETS[0], '')).toBe(true);
  });
});

describe('matchesFilters', () => {
  it('returns true when no filters are set', () => {
    expect(matchesFilters(MOCK_ASSETS[0], emptyFilter)).toBe(true);
  });
  it('filters by type', () => {
    expect(
      matchesFilters(MOCK_ASSETS[0], { ...emptyFilter, typeFilter: ['image'] }),
    ).toBe(true);
    expect(
      matchesFilters(MOCK_ASSETS[0], { ...emptyFilter, typeFilter: ['video'] }),
    ).toBe(false);
  });
  it('filters by format', () => {
    expect(
      matchesFilters(MOCK_ASSETS[0], {
        ...emptyFilter,
        formatFilter: ['PNG'],
      }),
    ).toBe(true);
    expect(
      matchesFilters(MOCK_ASSETS[0], {
        ...emptyFilter,
        formatFilter: ['JPG'],
      }),
    ).toBe(false);
  });
  it('filters by size bucket', () => {
    // hero-banner.png is 2.4 MB → medium
    expect(
      matchesFilters(MOCK_ASSETS[0], {
        ...emptyFilter,
        sizeBucket: 'medium',
      }),
    ).toBe(true);
    expect(
      matchesFilters(MOCK_ASSETS[0], {
        ...emptyFilter,
        sizeBucket: 'small',
      }),
    ).toBe(false);
  });
  it('filters by date bucket', () => {
    // hero-banner.png is 2026-06-01 → within 7d
    expect(
      matchesFilters(MOCK_ASSETS[0], {
        ...emptyFilter,
        dateBucket: '7d',
      }),
    ).toBe(true);
  });
  it('filters by uploader', () => {
    expect(
      matchesFilters(MOCK_ASSETS[0], {
        ...emptyFilter,
        uploaderFilter: ['张三'],
      }),
    ).toBe(true);
    expect(
      matchesFilters(MOCK_ASSETS[0], {
        ...emptyFilter,
        uploaderFilter: ['李四'],
      }),
    ).toBe(false);
  });
});

describe('isInSelection', () => {
  it('all returns non-trashed', () => {
    expect(isInSelection(MOCK_ASSETS[0], { kind: 'all' })).toBe(true);
    const trashed = MOCK_ASSETS.find((a) => a.deletedAt !== null)!;
    expect(isInSelection(trashed, { kind: 'all' })).toBe(false);
  });
  it('type routes to AssetType', () => {
    expect(isInSelection(MOCK_ASSETS[0], { kind: 'type', type: 'image' })).toBe(
      true,
    );
    expect(
      isInSelection(MOCK_ASSETS[0], { kind: 'type', type: 'video' }),
    ).toBe(false);
  });
  it('tag matches any-of', () => {
    expect(isInSelection(MOCK_ASSETS[0], { kind: 'tag', tag: '品牌物料' })).toBe(
      true,
    );
    expect(isInSelection(MOCK_ASSETS[0], { kind: 'tag', tag: 'nope' })).toBe(
      false,
    );
  });
  it('smart trash returns only deleted', () => {
    const trashed = MOCK_ASSETS.find((a) => a.deletedAt !== null)!;
    expect(isInSelection(trashed, { kind: 'smart', smart: 'trash' })).toBe(true);
    expect(isInSelection(MOCK_ASSETS[0], { kind: 'smart', smart: 'trash' })).toBe(
      false,
    );
  });
  it('smart favorites returns only favorited + non-trashed', () => {
    const fav = MOCK_ASSETS.find((a) => a.favorite && a.deletedAt === null)!;
    expect(isInSelection(fav, { kind: 'smart', smart: 'favorites' })).toBe(true);
    const nonFav = MOCK_ASSETS.find((a) => !a.favorite && a.deletedAt === null)!;
    expect(isInSelection(nonFav, { kind: 'smart', smart: 'favorites' })).toBe(
      false,
    );
  });
  it('smart recent returns last-30-days non-trashed', () => {
    const recent = MOCK_ASSETS.find((a) => a.deletedAt === null)!;
    expect(isInSelection(recent, { kind: 'smart', smart: 'recent' })).toBe(true);
    // trashed assets are not in recent
    const trashed = MOCK_ASSETS.find((a) => a.deletedAt !== null)!;
    expect(isInSelection(trashed, { kind: 'smart', smart: 'recent' })).toBe(
      false,
    );
  });
});

describe('selectVisibleAssets', () => {
  it('composes sidebar + filters + search', () => {
    const visible = selectVisibleAssets(MOCK_ASSETS, {
      searchQuery: '',
      selection: { kind: 'all' },
      viewMode: 'grid',
      selectedAssetId: null,
      filterPanelOpen: false,
      uploadDialogOpen: false,
      filter: {
        ...emptyFilter,
        typeFilter: ['image'],
      },
      selectedIds: [],
      sortKey: 'date',
      sortDir: 'desc',
    });
    expect(visible.every((a) => a.type === 'image')).toBe(true);
    expect(visible.every((a) => a.deletedAt === null)).toBe(true);
  });
});

describe('selectSidebarCounts', () => {
  it('counts active assets by type and tag', () => {
    const counts = selectSidebarCounts(MOCK_ASSETS);
    expect(counts.image).toBeGreaterThan(0);
    expect(counts.all).toBeGreaterThan(0);
    expect(counts.trash).toBe(2);
  });
});

describe('selectActiveFilterCount', () => {
  it('returns 0 when empty', () => {
    expect(selectActiveFilterCount(emptyFilter)).toBe(0);
  });
  it('counts each populated dimension', () => {
    expect(
      selectActiveFilterCount({
        ...emptyFilter,
        typeFilter: ['image', 'video'],
        uploaderFilter: ['张三'],
      }),
    ).toBe(2);
  });
});
