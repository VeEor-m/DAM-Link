import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../src/components/common/ToastProvider';

function Demo({ onMount }: { onMount: (t: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();
  onMount(toast);
  return null;
}

describe('ToastProvider', () => {
  it('renders a toast when showToast is called', async () => {
    let toast: ReturnType<typeof useToast> | null = null;
    render(
      <ToastProvider>
        <Demo onMount={(t) => (toast = t)} />
      </ToastProvider>,
    );
    act(() => toast!.showToast({ message: 'Hello' }));
    expect(await screen.findByText('Hello')).toBeInTheDocument();
  });

  it('renders an action button when provided', async () => {
    const onAction = vi.fn();
    let toast: ReturnType<typeof useToast> | null = null;
    render(
      <ToastProvider>
        <Demo onMount={(t) => (toast = t)} />
      </ToastProvider>,
    );
    act(() => toast!.showToast({ message: 'Deleted', actionLabel: 'Undo', onAction }));
    const btn = await screen.findByText('Undo');
    await userEvent.click(btn);
    expect(onAction).toHaveBeenCalled();
  });

  it('auto-dismisses after the default duration', async () => {
    vi.useFakeTimers();
    let toast: ReturnType<typeof useToast> | null = null;
    render(
      <ToastProvider>
        <Demo onMount={(t) => (toast = t)} />
      </ToastProvider>,
    );
    act(() => toast!.showToast({ message: 'Bye', durationMs: 1000 }));
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
