import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NeighborStrip } from '../../../src/components/preview/NeighborStrip';

const items = [
  { id: '1', thumbnailUrl: null, label: 'A' },
  { id: '2', thumbnailUrl: 'https://cdn/2.jpg', label: 'B' },
  { id: '3', thumbnailUrl: 'https://cdn/3.jpg', label: 'C' },
];

describe('NeighborStrip', () => {
  it('renders a thumbnail for each neighbor', () => {
    render(<NeighborStrip items={items} currentId="2" onNavigate={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marks the current item with aria-current=true', () => {
    render(<NeighborStrip items={items} currentId="2" onNavigate={() => {}} />);
    expect(screen.getByLabelText('B')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('A')).toHaveAttribute('aria-current', 'false');
  });

  it('calls onNavigate with the clicked id', () => {
    const fn = vi.fn();
    render(<NeighborStrip items={items} currentId="2" onNavigate={fn} />);
    fireEvent.click(screen.getByLabelText('A'));
    expect(fn).toHaveBeenCalledWith('1');
  });
});
