import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DetailPanel } from '../src/components/detail/DetailPanel';
import type { Asset } from '../src/state/types';

vi.mock('../src/lib/animations/detail-panel.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createSideDetailPanelTimeline: vi.fn(() => gsap.timeline({ paused: true })),
    createBottomSheetTimeline: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

import { createSideDetailPanelTimeline } from '../src/lib/animations/detail-panel.js';

const A: Asset = {
  id: 'a',
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

function noop() {}

describe('DetailPanel open/close (T18)', () => {
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
      dispatchEvent: () => false,
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('fires open when asset flips null → set', () => {
    const { rerender } = render(
      <DetailPanel
        asset={null}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();

    rerender(
      <DetailPanel
        asset={A}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'open',
    );
  });

  it('does NOT fire on asset swap (setA → setB)', () => {
    const { rerender } = render(
      <DetailPanel
        asset={A}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();

    rerender(
      <DetailPanel
        asset={B}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();
  });

  it('fires close when asset flips set → null', () => {
    const { rerender } = render(
      <DetailPanel
        asset={A}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();

    rerender(
      <DetailPanel
        asset={null}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'close',
    );
  });
});
