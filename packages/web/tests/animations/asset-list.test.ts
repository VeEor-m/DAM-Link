import { describe, it, expect } from 'vitest';
import { createAssetListFade } from '../../src/lib/animations/asset-list';

function makeList(n: number): { list: HTMLElement; rows: HTMLElement[] } {
  const list = document.createElement('div');
  const rows: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.setAttribute('data-anim', 'row');
    list.appendChild(row);
    rows.push(row);
  }
  return { list, rows };
}

describe('createAssetListFade', () => {
  it('returns a paused timeline', () => {
    const { list, rows } = makeList(3);
    const tl = createAssetListFade(list, rows);
    expect(tl.paused()).toBe(true);
  });

  it('is a single tween regardless of row count (whole-list fade, no per-row stagger)', () => {
    const { list, rows } = makeList(50);
    const tl = createAssetListFade(list, rows);
    expect(tl.getChildren(false, true, false).length).toBe(1);
  });

  it('returns an empty timeline for an empty list', () => {
    const { list, rows } = makeList(0);
    const tl = createAssetListFade(list, rows);
    expect(tl.paused()).toBe(true);
    expect(tl.getChildren(false, true, false).length).toBe(0);
  });
});
