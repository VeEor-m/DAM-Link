import { describe, it, expect } from 'vitest';
import { createAssetGridStagger } from '../../src/lib/animations/asset-grid';

function makeGrid(n: number): { grid: HTMLElement; cards: HTMLElement[] } {
  const grid = document.createElement('div');
  const cards: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const card = document.createElement('div');
    card.setAttribute('data-anim', 'card');
    grid.appendChild(card);
    cards.push(card);
  }
  return { grid, cards };
}

describe('createAssetGridStagger', () => {
  it('returns a paused timeline', () => {
    const { grid, cards } = makeGrid(3);
    const tl = createAssetGridStagger(grid, cards);
    expect(tl.paused()).toBe(true);
  });

  it('has one stagger tween whose targets are all the cards', () => {
    const { grid, cards } = makeGrid(4);
    const tl = createAssetGridStagger(grid, cards);
    // GSAP's .from(targets, { stagger }) creates a SINGLE stagger tween
    // wrapping all targets — not one tween per target — so the timeline
    // has 1 direct child regardless of card count. (Same caveat as
    // createAppShellMountEntrance's card stagger — see app-shell.test.ts.)
    const children = tl.getChildren(false, true, false);
    expect(children.length).toBe(1);
    // The single child must target all 4 cards.
    const totalTargets = children.reduce(
      (acc, t) => acc + t.targets().length,
      0,
    );
    expect(totalTargets).toBe(4);
  });

  it('returns an empty timeline for an empty grid (no cards)', () => {
    const { grid, cards } = makeGrid(0);
    const tl = createAssetGridStagger(grid, cards);
    expect(tl.paused()).toBe(true);
    expect(tl.getChildren(false, true, false).length).toBe(0);
  });
});
