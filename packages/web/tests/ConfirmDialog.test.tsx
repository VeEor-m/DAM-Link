import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useConfirm, ConfirmDialog } from '../src/components/common/ConfirmDialog';

function Harness({ onMount }: { onMount?: (api: ReturnType<typeof useConfirm>) => void }) {
  const api = useConfirm();
  if (onMount) onMount(api);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void api.confirm({ title: 'Hazard', body: 'Are you sure?' });
        }}
      >
        open
      </button>
      {api.dialogElement}
    </>
  );
}

describe('ConfirmDialog component', () => {
  it('renders nothing when request is null', () => {
    render(<ConfirmDialog request={null} onResolve={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and body when a request is present', () => {
    render(
      <ConfirmDialog
        request={{ title: 'Delete?', body: 'This is permanent' }}
        onResolve={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Delete?');
    expect(screen.getByText('This is permanent')).toBeInTheDocument();
  });

  it('uses Chinese default labels when not overridden', () => {
    render(
      <ConfirmDialog
        request={{ title: '?', body: '?' }}
        onResolve={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
  });

  it('applies the danger class to the confirm button when danger is true', () => {
    render(
      <ConfirmDialog
        request={{ title: '?', body: '?', danger: true }}
        onResolve={() => {}}
      />,
    );
    // The confirm button is the one with the danger class; we don't import
    // the module CSS, but we can still find it by its label and assert it
    // has the additional `danger` class beyond its base class.
    const confirm = screen.getByRole('button', { name: '确认' });
    expect(confirm.className.split(/\s+/).length).toBeGreaterThan(1);
  });
});

describe('useConfirm hook', () => {
  it('resolves true when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    let api!: ReturnType<typeof useConfirm>;
    render(<Harness onMount={(a) => (api = a)} />);

    let resolved: boolean | undefined;
    await act(async () => {
      api.confirm({ title: '?', body: '?' }).then((v) => (resolved = v));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(resolved).toBe(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    let api!: ReturnType<typeof useConfirm>;
    render(<Harness onMount={(a) => (api = a)} />);

    let resolved: boolean | undefined = true;
    await act(async () => {
      api.confirm({ title: '?', body: '?' }).then((v) => (resolved = v));
    });
    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(resolved).toBe(false));
  });

  it('resolves false when Escape is pressed', async () => {
    const user = userEvent.setup();
    let api!: ReturnType<typeof useConfirm>;
    render(<Harness onMount={(a) => (api = a)} />);

    let resolved: boolean | undefined = true;
    await act(async () => {
      api.confirm({ title: '?', body: '?' }).then((v) => (resolved = v));
    });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(resolved).toBe(false));
  });

  // Regression test for the I1 bug: concurrent confirm() calls must not leak
  // the first promise. The first call's resolver is auto-invoked with `false`
  // (cancel) when a second confirm comes in, so neither promise hangs.
  it('does not leak the first promise when a second confirm() is called', async () => {
    let api!: ReturnType<typeof useConfirm>;
    render(<Harness onMount={(a) => (api = a)} />);

    const first = vi.fn();
    const second = vi.fn();
    await act(async () => {
      api.confirm({ title: 'A', body: 'a' }).then(first);
      api.confirm({ title: 'B', body: 'b' }).then(second);
    });
    await waitFor(() => {
      expect(first).toHaveBeenCalledWith(false);
    });
    // Second is still pending; confirm via the dialog.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(second).toHaveBeenCalledWith(true));
  });
});
