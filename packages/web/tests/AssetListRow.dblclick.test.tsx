import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetListRow } from '../src/components/browser/AssetListRow';
import type { Asset } from '../src/state/types';

const baseAsset: Asset = {
  id: 'a01',
  orgId: 'org-1',
  name: 'row.png',
  type: 'image',
  format: 'PNG',
  size: 1_000,
  uploadedAt: '2026-06-01T00:00:00Z',
  uploadedBy: 'me',
  tags: [],
  favorite: false,
  deletedAt: null,
};

function makeProps(overrides: Partial<React.ComponentProps<typeof AssetListRow>> = {}) {
  return {
    asset: baseAsset,
    selected: false,
    onClick: vi.fn(),
    onToggleFavorite: vi.fn(),
    onKebab: vi.fn(),
    ...overrides,
  };
}

describe('AssetListRow onDoubleClick', () => {
  it('mouse dblclick on the row container calls onDoubleClick (when provided)', async () => {
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    render(<AssetListRow {...makeProps({ onDoubleClick })} />);
    // The row is a <div role="row">; query by role.
    const row = screen.getByRole('row');
    await user.dblClick(row);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('mouse dblclick on the select button bubbles to onDoubleClick on the row', async () => {
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    render(<AssetListRow {...makeProps({ onDoubleClick })} />);
    const select = screen.getByRole('button', { name: /选择 row\.png/ });
    await user.dblClick(select);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('mouse dblclick on the kebab does NOT bubble to onDoubleClick (stopPropagation)', async () => {
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    render(<AssetListRow {...makeProps({ onDoubleClick })} />);
    const kebab = screen.getByRole('button', { name: /更多操作/ });
    await user.dblClick(kebab);
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('Enter on the focused select button calls onDoubleClick (when provided)', async () => {
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    render(<AssetListRow {...makeProps({ onDoubleClick })} />);
    const select = screen.getByRole('button', { name: /选择 row\.png/ });
    select.focus();
    await user.keyboard('{Enter}');
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('Enter on the focused select button falls back to onClick when onDoubleClick is omitted', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AssetListRow {...makeProps({ onClick })} />);
    const select = screen.getByRole('button', { name: /选择 row\.png/ });
    select.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Space on the focused select button still calls onClick (native button behavior)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    render(<AssetListRow {...makeProps({ onClick, onDoubleClick })} />);
    const select = screen.getByRole('button', { name: /选择 row\.png/ });
    select.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});
