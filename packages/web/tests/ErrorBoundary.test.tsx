import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <div>safe content</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React's noisy "uncaught error" console.error so test
  // output stays clean. The throw is intentional.
  const origError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = origError;
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('safe content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a fallback with role=alert when a child throws', () => {
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.queryByText('safe content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('fallback shows the error message', () => {
    render(
      <ErrorBoundary onReset={vi.fn()}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it('clicking the reset button calls onReset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('recoverable: after reset, ErrorBoundary clears its error state so children render again', async () => {
    // Model the parent's recovery contract: when the boundary fires
    // onReset, the parent swaps the children to a non-throwing subtree
    // in the SAME tick. Wire that through onReset.mockImplementation.
    const user = userEvent.setup();
    const onReset = vi.fn();
    const { rerender } = render(
      <ErrorBoundary onReset={onReset}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    onReset.mockImplementation(() => {
      rerender(
        <ErrorBoundary onReset={onReset}>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>,
      );
    });

    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('safe content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
