import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AssetGrid } from '../src/components/browser/AssetGrid';
import type { Asset } from '../src/state/types';

vi.mock('../src/lib/animations/asset-grid.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createAssetGridStagger: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

import { createAssetGridStagger } from '../src/lib/animations/asset-grid.js';

const A: Asset = {
  id: 'a',
  orgId: 'org-1',
  name: 'a.png',
  type: 'image',
  format: 'PNG',
  size: 1000,
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: 'u1',
  tags: [],
  favorite: false,
  deletedAt: null,
  width: 100,
  height: 100,
};
const B: Asset = { ...A, id: 'b' };
const C: Asset = { ...A, id: 'c' };
const D: Asset = { ...A, id: 'd' };

describe('AssetGrid card stagger replay (T16)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('does not fire on first mount (the AppShell mount already animated the initial cards)', () => {
    const { rerender } = render(
      <AssetGrid
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).not.toHaveBeenCalled();

    // First non-empty render — still gated out by useIsFirstMount.
    rerender(
      <AssetGrid
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).not.toHaveBeenCalled();
  });

  it('fires on the second non-empty assets change (the gate has flipped)', () => {
    const { rerender } = render(
      <AssetGrid
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    rerender(
      <AssetGrid
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).not.toHaveBeenCalled();

    // Second non-empty change — now the gate is open.
    rerender(
      <AssetGrid
        assets={[C, D]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).toHaveBeenCalledTimes(1);
    expect(createAssetGridStagger).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      [expect.any(HTMLElement), expect.any(HTMLElement)],
    );
  });
});
