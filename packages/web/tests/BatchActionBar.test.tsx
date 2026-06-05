import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchActionBar } from '../src/components/batch/BatchActionBar';

describe('BatchActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <BatchActionBar
        count={0}
        onClear={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows "已选 N 项" when count is greater than 0', () => {
    render(
      <BatchActionBar
        count={3}
        onClear={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('已选 3 项')).toBeInTheDocument();
  });

  it('shows singular "已选 1 项" when count is 1', () => {
    render(
      <BatchActionBar
        count={1}
        onClear={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('已选 1 项')).toBeInTheDocument();
  });

  it('clear button calls onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <BatchActionBar
        count={2}
        onClear={onClear}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '取消选择' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('favorite button calls onToggleFavorite', async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    render(
      <BatchActionBar
        count={2}
        onClear={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '收藏' }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });

  it('shows "取消收藏" instead of "收藏" when allFavorites is true', () => {
    render(
      <BatchActionBar
        count={2}
        onClear={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
        allFavorites
      />,
    );
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '收藏' })).not.toBeInTheDocument();
  });

  it('delete button calls onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <BatchActionBar
        count={2}
        onClear={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole('button', { name: '移到回收站' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('has aria-live="polite" so screen readers announce selection changes', () => {
    render(
      <BatchActionBar
        count={2}
        onClear={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('已选 2 项')).toHaveAttribute('aria-live', 'polite');
  });
});
