import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StackedCardList } from '../src/components/browser/StackedCardList';
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
    tags: ['nature', 'sunset'],
    favorite: false,
    deletedAt: null,
    width: 800,
    height: 600,
    ...overrides,
  };
}

const assets: Asset[] = [
  makeAsset({ id: 'a1', name: 'sunset.png' }),
  makeAsset({ id: 'a2', name: 'forest.jpg', type: 'image', format: 'JPG', size: 2048 }),
  makeAsset({ id: 'a3', name: 'clip.mp4', type: 'video', format: 'MP4', size: 24000000, duration: 142 }),
];

describe('StackedCardList', () => {
  it('renders one card per asset, each with a visible ⋮ button (T2 — no hover required)', () => {
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(screen.getByText('sunset.png')).toBeInTheDocument();
    expect(screen.getByText('forest.jpg')).toBeInTheDocument();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '更多操作' })).toHaveLength(3);
  });

  it('clicking a card row invokes onSelect with the asset id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={onSelect}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: '选择 sunset.png' }));
    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('clicking the ⋮ button invokes onKebab with the asset and the kebab element', async () => {
    const onKebab = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={onKebab}
      />,
    );
    const kebabs = screen.getAllByRole('button', { name: '更多操作' });
    await user.click(kebabs[1]); // forest.jpg
    expect(onKebab).toHaveBeenCalledTimes(1);
    const [asset, anchor] = onKebab.mock.calls[0];
    expect(asset.id).toBe('a2');
    expect(anchor).toBe(kebabs[1]);
  });

  it('clicking the favorite star invokes onToggleFavorite with the asset id', async () => {
    const onToggleFavorite = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={onToggleFavorite}
        onKebab={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: '添加收藏 sunset.png' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('a1');
  });

  it('renders a different aria-label for an already-favorited asset', () => {
    const favs: Asset[] = [makeAsset({ id: 'a1', favorite: true })];
    render(
      <StackedCardList
        assets={favs}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '取消收藏 sunset.png' })).toBeInTheDocument();
  });

  it('marks the selected card with a selection ring (data-selected attribute)', () => {
    const { container } = render(
      <StackedCardList
        assets={assets}
        selectedId="a2"
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('forest.jpg');
  });

  it('clicking the favorite star does not also fire onSelect', async () => {
    const onSelect = vi.fn();
    const onToggleFavorite = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        onKebab={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: '添加收藏 sunset.png' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onToggleFavorite).toHaveBeenCalledWith('a1');
  });

  it('multi-select: clicking the checkbox calls onToggleMultiSelect with the id and does not open the asset', async () => {
    const onSelect = vi.fn();
    const onToggleMultiSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={onSelect}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
        onToggleMultiSelect={onToggleMultiSelect}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    await user.click(checkboxes[1]); // forest.jpg
    expect(onToggleMultiSelect).toHaveBeenCalledWith('a2');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('multi-select: reflects multiSelectedIds in aria-checked', () => {
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
        onToggleMultiSelect={() => {}}
        multiSelectedIds={['a2']}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'false');
    expect(checkboxes[1]).toHaveAttribute('aria-checked', 'true');
    expect(checkboxes[2]).toHaveAttribute('aria-checked', 'false');
  });
});
