import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPanel } from '../src/components/detail/DetailPanel';
import type { Asset } from '../src/state/types';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    name: 'sunset.png',
    type: 'image',
    format: 'PNG',
    size: 1024,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    uploadedBy: '我',
    tags: ['nature'],
    favorite: false,
    deletedAt: null,
    width: 800,
    height: 600,
    ...overrides,
  };
}

const noop = () => {};

describe('DetailPanel close button', () => {
  it('renders an X close button when an asset is selected', () => {
    render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByRole('button', { name: '关闭详情' })).toBeInTheDocument();
  });

  it('invokes onClose when the X is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: '关闭详情' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render the X button when no asset is selected', () => {
    render(
      <DetailPanel
        asset={null}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: '关闭详情' })).not.toBeInTheDocument();
    expect(screen.getByText('请从左侧选择一个资产')).toBeInTheDocument();
  });

  it('works without an onClose prop (backward compat for any future callers)', () => {
    // If onClose is omitted the panel must still render and the X must be
    // optional. We render without onClose and check no crash.
    expect(() =>
      render(
        <DetailPanel
          asset={makeAsset()}
          onToggleFavorite={noop}
          onDelete={noop}
          onCopyLink={noop}
          onDownload={noop}
          onRename={noop}
          onAddTag={noop}
          onRemoveTag={noop}
        />,
      ),
    ).not.toThrow();
  });
});

describe('DetailPanel sheet variant', () => {
  const noop = () => {};

  it('renders a drag handle styled as the close affordance when variant="sheet"', () => {
    const { container } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
        variant="sheet"
      />,
    );
    const close = container.querySelector('[data-sheet-close="true"]');
    expect(close).toBeInTheDocument();
  });

  it('does not apply the sheet variant marker when variant="side" (default)', () => {
    const { container } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
      />,
    );
    expect(container.querySelector('[data-sheet-close="true"]')).not.toBeInTheDocument();
  });

  it('shows a wider preview area in the wide variant', () => {
    const { container: side } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
        variant="side"
      />,
    );
    const { container: wide } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
        variant="wide"
      />,
    );
    expect(side.querySelector('[data-variant]')?.getAttribute('data-variant')).toBe('side');
    expect(wide.querySelector('[data-variant]')?.getAttribute('data-variant')).toBe('wide');
  });
});
