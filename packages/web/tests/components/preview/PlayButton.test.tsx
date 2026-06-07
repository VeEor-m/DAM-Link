import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayButton } from '../../../src/components/preview/PlayButton';

describe('PlayButton', () => {
  it('renders a play button with aria-label', () => {
    render(<PlayButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const fn = vi.fn();
    render(<PlayButton onClick={fn} />);
    fireEvent.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
