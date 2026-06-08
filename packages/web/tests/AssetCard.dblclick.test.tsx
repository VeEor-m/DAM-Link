import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetCard } from '../src/components/browser/AssetCard';
import type { Asset } from '../src/state/types';

const baseAsset: Asset = {
  id: 'a01',
  orgId: 'org-1',
  name: 'hero.png',
  type: 'image',
  format: 'PNG',
  size: 1_000,
  uploadedAt: '2026-06-01T00:00:00Z',
  uploadedBy: 'me',
  tags: [],
  favorite: false,
  deletedAt: null,
};

function makeProps(overrides: Partial<React.ComponentProps<typeof AssetCard>> = {}) {
  return {
    asset: baseAsset,
    selected: false,
    onClick: vi.fn(),
    showFavorite: false,
    ...overrides,
  };
}

describe('AssetCard onDoubleClick', () => {
  it('mouse dblclick on the card calls onDoubleClick (when provided)', async () => {
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    render(<AssetCard {...makeProps({ onDoubleClick })} />);
    const card = screen.getByRole('button', { name: /hero\.png/ });
    await user.dblClick(card);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('mouse single click on the card does NOT call onDoubleClick', async () => {
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    render(<AssetCard {...makeProps({ onDoubleClick })} />);
    const card = screen.getByRole('button', { name: /hero\.png/ });
    await user.click(card);
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('omitting onDoubleClick does not throw on dblclick', async () => {
    const user = userEvent.setup();
    render(<AssetCard {...makeProps()} />);
    const card = screen.getByRole('button', { name: /hero\.png/ });
    await expect(user.dblClick(card)).resolves.not.toThrow();
  });

  it('Enter on the focused card calls onDoubleClick (when provided)', async () => {
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    render(<AssetCard {...makeProps({ onDoubleClick })} />);
    const card = screen.getByRole('button', { name: /hero\.png/ });
    card.focus();
    await user.keyboard('{Enter}');
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('Enter on the focused card falls back to onClick when onDoubleClick is omitted', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AssetCard {...makeProps({ onClick })} />);
    const card = screen.getByRole('button', { name: /hero\.png/ });
    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Space on the focused card still calls onClick (NOT onDoubleClick)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    render(<AssetCard {...makeProps({ onClick, onDoubleClick })} />);
    const card = screen.getByRole('button', { name: /hero\.png/ });
    card.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});
