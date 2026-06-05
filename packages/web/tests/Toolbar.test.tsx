import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toolbar } from '../src/components/toolbar/Toolbar';
import type { SortKey } from '../src/state/types';

function makeProps(
  overrides: Partial<React.ComponentProps<typeof Toolbar>> = {},
) {
  return {
    searchQuery: '',
    onSearchChange: vi.fn(),
    viewMode: 'grid' as const,
    onViewModeChange: vi.fn(),
    onFilterClick: vi.fn(),
    onUploadClick: vi.fn(),
    filterCount: 0,
    sortKey: 'date' as SortKey,
    sortDir: 'desc' as const,
    onSortChange: vi.fn(),
    assets: [],
    ...overrides,
  };
}

describe('Toolbar sort dropdown', () => {
  it('renders a select with the 5 sort options', () => {
    render(<Toolbar {...makeProps()} />);
    const select = screen.getByLabelText('排序方式');
    expect(select.tagName).toBe('SELECT');
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(5);
    expect(options[0]).toHaveTextContent('名称');
    expect(options[1]).toHaveTextContent('类型');
    expect(options[2]).toHaveTextContent('大小');
    expect(options[3]).toHaveTextContent('上传时间');
    expect(options[4]).toHaveTextContent('收藏');
  });

  it('reflects the current sortKey in the selected option', () => {
    render(<Toolbar {...makeProps({ sortKey: 'name', sortDir: 'asc' })} />);
    const select = screen.getByLabelText('排序方式') as HTMLSelectElement;
    expect(select.value).toBe('name');
  });

  it('changing the dropdown calls onSortChange with the new key (preserving dir)', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(<Toolbar {...makeProps({ sortKey: 'date', sortDir: 'desc', onSortChange })} />);
    const select = screen.getByLabelText('排序方式');
    await user.selectOptions(select, 'name');
    expect(onSortChange).toHaveBeenCalledWith({ sortKey: 'name', sortDir: 'desc' });
  });

  it('renders a direction toggle button next to the sort dropdown', () => {
    render(<Toolbar {...makeProps({ sortKey: 'name', sortDir: 'asc' })} />);
    const btn = screen.getByRole('button', { name: /升序/ });
    expect(btn).toBeInTheDocument();
  });

  it('clicking the direction toggle flips sortDir while keeping sortKey', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(<Toolbar {...makeProps({ sortKey: 'name', sortDir: 'asc', onSortChange })} />);
    await user.click(screen.getByRole('button', { name: /降序/ }));
    expect(onSortChange).toHaveBeenCalledWith({ sortKey: 'name', sortDir: 'desc' });
  });

  it('hides the sort dropdown in compact mode (phone/tablet) — the menu icon is the primary control', () => {
    render(<Toolbar {...makeProps({ compact: true })} />);
    expect(screen.queryByLabelText('排序方式')).not.toBeInTheDocument();
  });
});
