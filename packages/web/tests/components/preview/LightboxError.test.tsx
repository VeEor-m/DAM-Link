import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LightboxError } from '../../../src/components/preview/LightboxError';

describe('LightboxError', () => {
  it('renders the message and a 重试 button', () => {
    render(<LightboxError message="加载失败" onRetry={() => {}} />);
    expect(screen.getByText('加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('calls onRetry when 重试 is clicked', () => {
    const fn = vi.fn();
    render(<LightboxError message="x" onRetry={fn} />);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
