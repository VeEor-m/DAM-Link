import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from '../src/components/common/Drawer';

function Harness({
  open: controlled,
  onClose,
  side = 'left',
  width,
}: {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  width?: string;
}) {
  return (
    <Drawer open={controlled} onClose={onClose} side={side} width={width} label="test drawer">
      <button type="button">first</button>
      <button type="button">second</button>
    </Drawer>
  );
}

describe('Drawer', () => {
  it('renders nothing when open is false', () => {
    render(<Harness open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog with aria-modal when open', () => {
    render(<Harness open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'test drawer');
  });

  it('auto-focuses the first focusable child on open', () => {
    render(<Harness open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    // The backdrop is the immediate parent of the dialog in the portal.
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the drawer', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape with stopImmediatePropagation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    // Add a second listener to verify stopImmediatePropagation cuts it off.
    const otherHandler = vi.fn();
    document.addEventListener('keydown', otherHandler);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(otherHandler).not.toHaveBeenCalled();
    document.removeEventListener('keydown', otherHandler);
  });

  it('traps focus: Tab from the last item cycles to the first', async () => {
    const user = userEvent.setup();
    render(<Harness open onClose={() => {}} />);
    const second = screen.getByRole('button', { name: 'second' });
    second.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('traps focus: Shift+Tab from the first item cycles to the last', async () => {
    const user = userEvent.setup();
    render(<Harness open onClose={() => {}} />);
    // First is focused on open. Shift+Tab should land on second.
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'second' })).toHaveFocus();
  });

  it('renders a slide-in panel with the configured side and width', () => {
    render(
      <Harness open onClose={() => {}} side="right" width="320px" />,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-side', 'right');
    expect(panel).toHaveStyle({ width: '320px' });
  });

  it('restores focus to the trigger on close', async () => {
    function H() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            data-testid="trigger"
            onClick={() => setOpen(true)}
          >
            open
          </button>
          <Drawer open={open} onClose={() => setOpen(false)} label="t" side="left">
            <button type="button">inside</button>
          </Drawer>
        </>
      );
    }
    const user = userEvent.setup();
    render(<H />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
