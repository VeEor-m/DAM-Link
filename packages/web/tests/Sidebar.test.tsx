import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../src/components/sidebar/Sidebar';
import type { SidebarSelection } from '../src/state/types';

const baseCounts = {
  all: 10,
  image: 5,
  video: 2,
  document: 1,
  audio: 1,
  favorites: 1,
  trash: 0,
};

function makeCounts(byTag: Record<string, number>) {
  return { ...baseCounts, byTag };
}

function renderSidebar(
  byTag: Record<string, number>,
  selection: SidebarSelection = { kind: 'all' },
) {
  const onSelect = vi.fn();
  render(
    <Sidebar
      selection={selection}
      onSelect={onSelect}
      counts={makeCounts(byTag)}
    />,
  );
  return { onSelect };
}

describe('Sidebar tag collapse', () => {
  it('renders all tags without a toggle when count is at the threshold', () => {
    renderSidebar({ a: 1, b: 1, c: 1, d: 1, e: 1 });
    expect(screen.getByText(/^a/)).toBeInTheDocument();
    expect(screen.getByText(/^e/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /展开/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /收起/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the first 5 tags and a 展开 toggle when count exceeds the threshold', () => {
    renderSidebar({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
    expect(screen.getByText(/^a/)).toBeInTheDocument();
    expect(screen.getByText(/^e/)).toBeInTheDocument();
    expect(screen.queryByText(/^f/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^g/)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /展开/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands to show all tags and flips the toggle label on click', async () => {
    const user = userEvent.setup();
    renderSidebar({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
    await user.click(screen.getByRole('button', { name: /展开/ }));
    expect(screen.getByText(/^f/)).toBeInTheDocument();
    expect(screen.getByText(/^g/)).toBeInTheDocument();
    const collapse = screen.getByRole('button', { name: /收起/ });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses back to the first 5 tags on second click', async () => {
    const user = userEvent.setup();
    renderSidebar({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 });
    await user.click(screen.getByRole('button', { name: /展开/ }));
    await user.click(screen.getByRole('button', { name: /收起/ }));
    expect(screen.queryByText(/^f/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /展开/ }),
    ).toBeInTheDocument();
  });

  it('auto-expands when the active tag sits beyond the visible window', () => {
    renderSidebar(
      { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 },
      { kind: 'tag', tag: 'g' },
    );
    // 'g' is the 7th tag alphabetically — it should be visible without a click.
    expect(screen.getByText(/^g/)).toBeInTheDocument();
    // The toggle should reflect the auto-expanded state.
    expect(
      screen.getByRole('button', { name: /收起/ }),
    ).toBeInTheDocument();
  });

  it('sorts tags by count descending so the most-used tags are visible first', () => {
    // 6 tags with distinct counts — sort order is unambiguous:
    //   b(10) > f(8) > d(7) > c(5) > e(3) > a(1)
    // So 'b' is visible at the top, 'a' is hidden at the bottom.
    renderSidebar({
      a: 1,
      b: 10,
      c: 5,
      d: 7,
      e: 3,
      f: 8,
    });
    const visibleTags = screen
      .getAllByRole('button', { name: /^\w+ \d+$/ })
      .map((b) => b.textContent ?? '');
    // First visible row should be 'b' (count 10).
    expect(visibleTags[0]).toMatch(/^b 10/);
    // 'a' (count 1) is the least-used and should be hidden.
    expect(screen.queryByText(/^a 1/)).not.toBeInTheDocument();
  });
});
