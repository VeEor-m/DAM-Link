import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StackedCardList } from '../src/components/browser/StackedCardList';
import type { Asset } from '../src/state/types';

const baseAsset: Asset = {
  id: 'a01',
  orgId: 'org-1',
  name: 'stacked.png',
  type: 'image',
  format: 'PNG',
  size: 1_000,
  uploadedAt: '2026-06-01T00:00:00Z',
  uploadedBy: 'me',
  tags: [],
  favorite: false,
  deletedAt: null,
};

function makeProps(overrides: Partial<React.ComponentProps<typeof StackedCardList>> = {}) {
  return {
    assets: [baseAsset],
    selectedId: null,
    onSelect: vi.fn(),
    onToggleFavorite: vi.fn(),
    onKebab: vi.fn(),
    ...overrides,
  };
}

describe('StackedCardList onDoubleClick', () => {
  it('mouse dblclick on the row container calls onOpen (when provided)', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StackedCardList {...makeProps({ onOpen })} />);
    const row = screen.getByRole('listitem');
    await user.dblClick(row);
    expect(onOpen).toHaveBeenCalledWith('a01');
  });

  it('mouse dblclick on the select button bubbles to onOpen', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StackedCardList {...makeProps({ onOpen })} />);
    const select = screen.getByRole('button', { name: /选择 stacked\.png/ });
    await user.dblClick(select);
    expect(onOpen).toHaveBeenCalledWith('a01');
  });

  it('mouse dblclick on the kebab does NOT call onOpen (stopPropagation)', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StackedCardList {...makeProps({ onOpen })} />);
    const kebab = screen.getByRole('button', { name: /更多操作/ });
    await user.dblClick(kebab);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('Enter on the focused select button calls onOpen (when provided)', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<StackedCardList {...makeProps({ onOpen })} />);
    const select = screen.getByRole('button', { name: /选择 stacked\.png/ });
    select.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('a01');
  });

  it('Enter on the focused select button falls back to onSelect when onOpen is omitted', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StackedCardList {...makeProps({ onSelect })} />);
    const select = screen.getByRole('button', { name: /选择 stacked\.png/ });
    select.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('a01');
  });

  it('Space on the focused select button still calls onSelect (native button behavior)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(<StackedCardList {...makeProps({ onSelect, onOpen })} />);
    const select = screen.getByRole('button', { name: /选择 stacked\.png/ });
    select.focus();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledWith('a01');
    expect(onOpen).not.toHaveBeenCalled();
  });
});
