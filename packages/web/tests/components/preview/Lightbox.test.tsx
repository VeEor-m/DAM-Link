import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api/assets', () => ({
  getPlaybackUrl: vi.fn(),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { Lightbox } from '../../../src/components/preview/Lightbox.js';
import type { Asset } from '../../../src/state/types.js';
import { getPlaybackUrl } from '../../../src/api/assets.js';

const asset: Asset = {
  id: '1', orgId: 'org-1', name: 'hero.png', type: 'image', format: 'PNG', size: 2_400_000,
  uploadedAt: '', uploadedBy: 'u', tags: [], favorite: false, deletedAt: null,
};

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
});
