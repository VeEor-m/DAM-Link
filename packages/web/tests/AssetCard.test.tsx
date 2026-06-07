import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetCard } from '../src/components/browser/AssetCard';
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
  overrides: Partial<React.ComponentProps<typeof AssetCard>> = {},
) {
  return {
    asset: baseAsset,
    selected: false,
    onClick: vi.fn(),
    showFavorite: false,
    ...overrides,
  };
}

describe('AssetCard multi-select checkbox', () => {
  it('renders a checkbox when onToggleMultiSelect is provided', () => {
    render(<AssetCard {...makeProps({ onToggleMultiSelect: vi.fn() })} />);
    expect(screen.getByRole('checkbox', { name: /选择/ })).toBeInTheDocument();
  });

  it('does not render a checkbox when onToggleMultiSelect is omitted', () => {
    render(<AssetCard {...makeProps()} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('checkbox aria-checked reflects multiSelected', () => {
    const { rerender } = render(
      <AssetCard
        {...makeProps({ onToggleMultiSelect: vi.fn(), multiSelected: false })}
      />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    rerender(
      <AssetCard
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
      <AssetCard {...makeProps({ onToggleMultiSelect })} />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onToggleMultiSelect).toHaveBeenCalledTimes(1);
  });

  it('clicking the checkbox does NOT call onClick (the card open handler)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onToggleMultiSelect = vi.fn();
    render(
      <AssetCard {...makeProps({ onClick, onToggleMultiSelect })} />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('clicking the card body (not the checkbox) calls onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AssetCard {...makeProps({ onClick })} />);
    await user.click(screen.getByRole('button', { name: /hero-banner.png/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Space key on the focused checkbox calls onToggleMultiSelect', async () => {
    const user = userEvent.setup();
    const onToggleMultiSelect = vi.fn();
    render(
      <AssetCard {...makeProps({ onToggleMultiSelect })} />,
    );
    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard(' ');
    expect(onToggleMultiSelect).toHaveBeenCalledTimes(1);
  });

  // Bug fix: the outer card used to be a <button> which contained the
  // checkbox and kebab <button>s (and the kebab was there pre-fix).
  // HTML disallows nested buttons; the renderer warned and React
  // flagged a hydration risk. Fix: outer is a <div role="button">
  // with tabIndex=0 and an Enter/Space keyboard handler.
  describe('outer element is not a <button> (no nested-button warning)', () => {
    it('renders the card as a <div> with role="button" so inner <button>s are not nested', () => {
      const { container } = render(
        <AssetCard {...makeProps({ onToggleMultiSelect: vi.fn() })} />,
      );
      const card = screen.getByRole('button', { name: /hero-banner.png/ });
      expect(card.tagName).toBe('DIV');
      // No <button> ancestor of the inner checkbox (the only way a
      // button could be nested in a button is if we regressed).
      // Start at the parent — the checkbox itself is a <button> by
      // design; what we care about is that nothing ABOVE it is one.
      const checkbox = screen.getByRole('checkbox');
      let cur: HTMLElement | null = checkbox.parentElement;
      while (cur && cur !== container) {
        expect(cur.tagName).not.toBe('BUTTON');
        cur = cur.parentElement;
      }
    });

    it('Enter key on the focused card calls onClick', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<AssetCard {...makeProps({ onClick })} />);
      const card = screen.getByRole('button', { name: /hero-banner.png/ });
      card.focus();
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('Space key on the focused card calls onClick', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<AssetCard {...makeProps({ onClick })} />);
      const card = screen.getByRole('button', { name: /hero-banner.png/ });
      card.focus();
      await user.keyboard(' ');
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('Space key on the focused checkbox (child) does NOT bubble up to the card click', async () => {
      // The card's keyboard handler must only fire when the card
      // itself is the event target. Otherwise the card would steal
      // the Space/Enter keypress from the inner checkbox / kebab.
      const user = userEvent.setup();
      const onClick = vi.fn();
      const onToggleMultiSelect = vi.fn();
      render(
        <AssetCard {...makeProps({ onClick, onToggleMultiSelect })} />,
      );
      const checkbox = screen.getByRole('checkbox');
      checkbox.focus();
      await user.keyboard(' ');
      // The native <button role="checkbox"> toggles itself, so
      // onToggleMultiSelect fires. The card's onClick must NOT fire.
      expect(onToggleMultiSelect).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});

describe('AssetCard thumbnail rendering (regression: Plan 8 migration read site)', () => {
  const PRESIGNED = 'http://localhost:9000/dam-link-dev/thumbnails/org/asset.webp?X-Amz-Signature=abc';

  // The thumb <img> uses alt="" (decorative) so getByRole('img') doesn't match.
  // Query the DOM directly for the first <img> in the card.
  function findThumbImg(container: HTMLElement): HTMLImageElement {
    const img = container.querySelector('img');
    if (!img) throw new Error('thumb <img> not rendered');
    return img;
  }

  it('renders the API thumbnail <img> when _thumbnailUrl is set (Plan 8 path)', () => {
    const { container } = render(
      <AssetCard
        {...makeProps({
          // Cast: _thumbnailUrl is populated by persistence.ts loadState()
          // from the API response; the type cast there bypasses the strict
          // Asset shape. This test pins the consumer's expectation.
          asset: { ...baseAsset, _thumbnailUrl: PRESIGNED } as Asset,
        })}
      />,
    );
    expect(findThumbImg(container)).toHaveAttribute('src', PRESIGNED);
  });

  it('renders the legacy previewDataUrl <img> when only that is set (back-compat)', () => {
    const dataUrl = 'data:image/png;base64,AAAA';
    const { container } = render(
      <AssetCard
        {...makeProps({ asset: { ...baseAsset, previewDataUrl: dataUrl } })}
      />,
    );
    expect(findThumbImg(container)).toHaveAttribute('src', dataUrl);
  });

  it('falls back to the type emoji when neither thumbnail source is set', () => {
    const { container } = render(<AssetCard {...makeProps()} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
