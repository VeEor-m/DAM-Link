import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetListRow } from '../src/components/browser/AssetListRow';
import type { Asset } from '../src/state/types';

const baseAsset: Asset = {
  id: 'a01',
  orgId: 'org-1',
  name: 'hero-banner.png',
  type: 'image',
  format: 'PNG',
  size: 2_400_000,
  uploadedAt: '2026-06-01T09:00:00Z',
  uploadedBy: '张三',
  tags: [],
  favorite: false,
  deletedAt: null,
  width: 1920,
  height: 600,
};

function makeProps(
  overrides: Partial<React.ComponentProps<typeof AssetListRow>> = {},
) {
  return {
    asset: baseAsset,
    selected: false,
    onClick: vi.fn(),
    onToggleFavorite: vi.fn(),
    onKebab: vi.fn(),
    ...overrides,
  };
}

describe('AssetListRow multi-select checkbox', () => {
  it('renders a checkbox when onToggleMultiSelect is provided', () => {
    render(<AssetListRow {...makeProps({ onToggleMultiSelect: vi.fn() })} />);
    expect(screen.getByRole('checkbox', { name: /选择/ })).toBeInTheDocument();
  });

  it('does not render a checkbox when onToggleMultiSelect is omitted', () => {
    render(<AssetListRow {...makeProps()} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('checkbox aria-checked reflects multiSelected', () => {
    const { rerender } = render(
      <AssetListRow
        {...makeProps({ onToggleMultiSelect: vi.fn(), multiSelected: false })}
      />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    rerender(
      <AssetListRow
        {...makeProps({ onToggleMultiSelect: vi.fn(), multiSelected: true })}
      />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('clicking the checkbox calls onToggleMultiSelect', async () => {
    const user = userEvent.setup();
    const onToggleMultiSelect = vi.fn();
    render(
      <AssetListRow {...makeProps({ onToggleMultiSelect })} />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onToggleMultiSelect).toHaveBeenCalledTimes(1);
  });

  it('clicking the checkbox does NOT call onClick (the row open handler)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onToggleMultiSelect = vi.fn();
    render(
      <AssetListRow {...makeProps({ onClick, onToggleMultiSelect })} />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('clicking the row select button calls onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AssetListRow {...makeProps({ onClick })} />);
    await user.click(screen.getByRole('button', { name: /选择 hero-banner.png/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Space key on the focused checkbox calls onToggleMultiSelect', async () => {
    const user = userEvent.setup();
    const onToggleMultiSelect = vi.fn();
    render(
      <AssetListRow {...makeProps({ onToggleMultiSelect })} />,
    );
    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard(' ');
    expect(onToggleMultiSelect).toHaveBeenCalledTimes(1);
  });
});
