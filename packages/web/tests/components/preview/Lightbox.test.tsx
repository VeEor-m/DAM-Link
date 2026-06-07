import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api/assets', () => ({
  getPlaybackUrl: vi.fn(),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Lightbox } from '../../../src/components/preview/Lightbox.js';
import type { Asset } from '../../../src/state/types.js';
import { getPlaybackUrl } from '../../../src/api/assets.js';

const asset: Asset = {
  id: '1', orgId: 'org-1', name: 'hero.png', type: 'image', format: 'PNG', size: 2_400_000,
  uploadedAt: '', uploadedBy: 'u', tags: [], favorite: false, deletedAt: null,
};
const videoAsset: Asset = { ...asset, id: 'v1', type: 'video', format: 'MP4' };

const neighbors = [
  { id: '0', thumbnailUrl: 'https://cdn/0.jpg', label: 'prev' },
  { id: '1', thumbnailUrl: 'https://cdn/1.jpg', label: 'current' },
  { id: '2', thumbnailUrl: 'https://cdn/2.jpg', label: 'next' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPlaybackUrl).mockResolvedValue({ downloadUrl: 'https://cdn/full.png' });
});

describe('Lightbox', () => {
  it('renders nothing when asset is null', () => {
    render(
      <Lightbox asset={null} neighbors={[]} visibleIds={[]} orgId="o1" onNavigate={() => {}} onClose={() => {}} onToggleFavorite={() => {}} onDownload={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the filename in the header', () => {
    render(
      <Lightbox asset={asset} neighbors={neighbors} visibleIds={['0','1','2']} orgId="o1" onNavigate={() => {}} onClose={() => {}} onToggleFavorite={() => {}} onDownload={() => {}} />,
    );
    expect(screen.getByText('hero.png')).toBeInTheDocument();
  });

  it('renders the close button with aria-label', () => {
    render(
      <Lightbox asset={asset} neighbors={neighbors} visibleIds={['0','1','2']} orgId="o1" onNavigate={() => {}} onClose={() => {}} onToggleFavorite={() => {}} onDownload={() => {}} />,
    );
    expect(screen.getByTestId('lightbox-floating-close')).toBeInTheDocument();
  });

  it('clicking close calls onClose', () => {
    const fn = vi.fn();
    render(
      <Lightbox asset={asset} neighbors={neighbors} visibleIds={['0','1','2']} orgId="o1" onNavigate={() => {}} onClose={fn} onToggleFavorite={() => {}} onDownload={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('lightbox-floating-close'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clicking the download button calls onDownload', () => {
    const fn = vi.fn();
    render(
      <Lightbox asset={asset} neighbors={neighbors} visibleIds={['0','1','2']} orgId="o1" onNavigate={() => {}} onClose={() => {}} onToggleFavorite={() => {}} onDownload={fn} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '下载' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clicking a neighbor thumbnail calls onNavigate', () => {
    const fn = vi.fn();
    render(
      <Lightbox asset={asset} neighbors={neighbors} visibleIds={['0','1','2']} orgId="o1" onNavigate={fn} onClose={() => {}} onToggleFavorite={() => {}} onDownload={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText('next'));
    expect(fn).toHaveBeenCalledWith('2');
  });

  it('has role="dialog" and aria-modal="true"', () => {
    render(
      <Lightbox asset={asset} neighbors={neighbors} visibleIds={['0','1','2']} orgId="o1" onNavigate={() => {}} onClose={() => {}} onToggleFavorite={() => {}} onDownload={() => {}} />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  // Regression test for the "video stutters / restarts every ~2s" bug.
  //
  // Background: Lightbox itself re-renders every ~2s when the idle-timer
  // (useLightbox → useIdleTimer) flips isIdle from false to true. Before
  // the fix, Lightbox.tsx:154 was passing an inline arrow function
  // `onError={() => {}}` to <MediaStage>, so every Lightbox re-render
  // produced a NEW onError reference. MediaStageInner's useEffect lists
  // `onError` in its deps, so a new reference re-ran the effect →
  // getPlaybackUrl() → setPlaybackUrl(newUrl) → <video src> changed →
  // the browser restarted video playback from byte 0. User-visible
  // symptom: video plays a few seconds then pauses/restarts.
  //
  // The fix is in Lightbox.tsx: pass a module-level noop constant
  // (stable reference, allocated once) instead of an inline arrow. This
  // test simulates the same re-render pattern (rerender with the same
  // props forces Lightbox to re-render) and asserts that getPlaybackUrl
  // is called exactly once, not twice.
  it('does not re-fetch getPlaybackUrl on Lightbox re-render (regression: video src restart every 2s)', async () => {
    vi.mocked(getPlaybackUrl).mockResolvedValue({ downloadUrl: 'https://cdn/v.mp4' });

    const { rerender } = render(
      <Lightbox
        asset={videoAsset}
        neighbors={neighbors}
        visibleIds={['0', '1', '2']}
        orgId="o1"
        onNavigate={() => {}}
        onClose={() => {}}
        onToggleFavorite={() => {}}
        onDownload={() => {}}
      />,
    );

    // Wait for the initial fetch to land.
    await waitFor(() => {
      expect(vi.mocked(getPlaybackUrl)).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(getPlaybackUrl)).toHaveBeenCalledWith('o1', 'v1');

    // Force a Lightbox re-render with the same props. With the bug
    // (inline onError in Lightbox.tsx), this produces a new onError
    // reference → MediaStage's useEffect re-fires → getPlaybackUrl is
    // called a second time. With the fix (module-level noop), the
    // onError reference is stable across re-renders → effect does NOT
    // re-fire → getPlaybackUrl is still only called once.
    rerender(
      <Lightbox
        asset={videoAsset}
        neighbors={neighbors}
        visibleIds={['0', '1', '2']}
        orgId="o1"
        onNavigate={() => {}}
        onClose={() => {}}
        onToggleFavorite={() => {}}
        onDownload={() => {}}
      />,
    );

    // Give the effect a tick to (not) re-run.
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(getPlaybackUrl)).toHaveBeenCalledTimes(1);
  });
});
