import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api/assets', () => ({
  getPlaybackUrl: vi.fn(),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaStage } from '../../../src/components/preview/MediaStage';
import { getPlaybackUrl } from '../../../src/api/assets';
import type { Asset } from '../../../src/state/types';

const imageAsset: Asset = {
  id: 'i1', name: 'a.png', type: 'image', format: 'PNG', size: 100,
  uploadedAt: '', uploadedBy: 'u', tags: [], favorite: false, deletedAt: null,
  _thumbnailUrl: 'https://cdn/thumb.jpg',
};
const videoAsset: Asset = { ...imageAsset, id: 'v1', type: 'video', format: 'MP4' };
const audioAsset: Asset = { ...imageAsset, id: 'a1', type: 'audio', format: 'MP3' };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: successful playback URL fetch (tests that need a rejection override this).
  vi.mocked(getPlaybackUrl).mockResolvedValue({ downloadUrl: 'https://cdn/full.png' });
});

describe('MediaStage', () => {
  it('shows the thumbnail immediately for an image', () => {
    render(<MediaStage orgId="o1" asset={imageAsset} onError={() => {}} />);
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://cdn/thumb.jpg');
  });

  it('cross-fades to the real image when getPlaybackUrl resolves', async () => {
    vi.mocked(getPlaybackUrl).mockResolvedValue({ downloadUrl: 'https://cdn/full.png' });
    render(<MediaStage orgId="o1" asset={imageAsset} onError={() => {}} />);
    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      // The real <img> is now mounted
      expect(imgs.some((i) => (i as HTMLImageElement).src === 'https://cdn/full.png')).toBe(true);
    });
  });

  it('for video: shows a poster + PlayButton; clicking play starts playback', async () => {
    vi.mocked(getPlaybackUrl).mockResolvedValue({ downloadUrl: 'https://cdn/v.mp4' });
    render(<MediaStage orgId="o1" asset={videoAsset} posterUrl="https://cdn/poster.jpg" onError={() => {}} />);
    expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    await waitFor(() => {
      const vids = document.querySelectorAll('video');
      expect(vids.length).toBe(1);
      expect((vids[0] as HTMLVideoElement).src).toBe('https://cdn/v.mp4');
    });
  });

  it('for audio: shows the cover + PlayButton; clicking play reveals <audio>', async () => {
    vi.mocked(getPlaybackUrl).mockResolvedValue({ downloadUrl: 'https://cdn/a.mp3' });
    render(<MediaStage orgId="o1" asset={audioAsset} onError={() => {}} />);
    expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    await waitFor(() => {
      const auds = document.querySelectorAll('audio');
      expect(auds.length).toBe(1);
      expect((auds[0] as HTMLAudioElement).src).toBe('https://cdn/a.mp3');
    });
  });

  it('shows the error UI when getPlaybackUrl rejects', async () => {
    vi.mocked(getPlaybackUrl).mockRejectedValue(new Error('boom'));
    render(<MediaStage orgId="o1" asset={imageAsset} onError={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('加载失败');
    });
  });
});
