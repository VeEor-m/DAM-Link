import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AssetList } from '../src/components/browser/AssetList';
import type { Asset } from '../src/state/types';
import { initialUI } from '../src/state/initialUI';

vi.mock('../src/lib/animations/asset-list.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createAssetListFade: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

vi.mock('../src/hooks/useStore', () => ({
  useStore: () => ({
    state: {
      assets: [],
      ui: { ...initialUI, filter: { ...initialUI.filter } },
    },
    dispatch: vi.fn(),
  }),
}));

import { createAssetListFade } from '../src/lib/animations/asset-list.js';

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

describe('AssetList fade replay (T17)', () => {
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

  it('does not fire on first mount', () => {
    const { rerender } = render(
      <AssetList
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).not.toHaveBeenCalled();

    rerender(
      <AssetList
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).not.toHaveBeenCalled();
  });

  it('fires on the second non-empty assets change', () => {
    const { rerender } = render(
      <AssetList
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    rerender(
      <AssetList
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).not.toHaveBeenCalled();

    rerender(
      <AssetList
        assets={[C]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).toHaveBeenCalledTimes(1);
  });
});
