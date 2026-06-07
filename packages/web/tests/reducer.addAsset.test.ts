import { describe, it, expect } from 'vitest';
import { reducer } from '../src/state/reducer';
import type { AppState, Asset } from '../src/state/types';
import type { UIState } from '../src/state/types';

const baseAsset: Asset = {
  id: 'a1',
  name: 'a.png',
  type: 'image',
  format: 'PNG',
  size: 1,
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: 'u1',
  tags: [],
  favorite: false,
  deletedAt: null,
};
const older: Asset = { ...baseAsset, id: 'a0', uploadedAt: '2026-06-06T00:00:00.000Z' };
const newer: Asset = { ...baseAsset, id: 'a2', uploadedAt: '2026-06-08T00:00:00.000Z' };

// Minimal UIState stub — reducer only uses assets path for ADD_ASSET.
const stubUi = {} as UIState;
const emptyState: AppState = { assets: [baseAsset], ui: stubUi };

describe('reducer — ADD_ASSET', () => {
  it('prepends the new asset (newest-first ordering)', () => {
    const next = reducer(emptyState, { type: 'ADD_ASSET', asset: newer });
    expect(next.assets[0]?.id).toBe('a2');
    expect(next.assets[1]?.id).toBe('a1');
  });

  it('does not mutate the input state', () => {
    const snapshot = [...emptyState.assets];
    reducer(emptyState, { type: 'ADD_ASSET', asset: older });
    expect(emptyState.assets).toEqual(snapshot);
  });

  it('does not deduplicate — adding an existing id leaves the list with a duplicate (caller is responsible for de-dup)', () => {
    const next = reducer(emptyState, { type: 'ADD_ASSET', asset: baseAsset });
    expect(next.assets.filter((a) => a.id === 'a1').length).toBe(2);
  });
});
