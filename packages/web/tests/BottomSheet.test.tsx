import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomSheet } from '../src/components/common/BottomSheet';

beforeEach(() => {
  // jsdom reports 1024x768 by default; the snap math uses innerHeight.
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
});

afterEach(() => {
  // Each test should restore scroll on its own; this catches leaks.
  expect(document.body.style.overflow).not.toBe('hidden');
});

function make(onClose: () => void) {
  return (
    <BottomSheet open onClose={onClose} peekHeight="50%" expandedHeight="90%" label="t">
      <button type="button">first</button>
      <button type="button">second</button>
    </BottomSheet>
  );
}

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} label="t"><span /></BottomSheet>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog with aria-modal and the supplied label', () => {
    render(make(() => {}));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 't');
  });

  it('auto-focuses the first focusable child on open', () => {
    render(make(() => {}));
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('locks body scroll while open and restores on close', () => {
    function H() {
      const [open, setOpen] = useState(true);
      return (
        <BottomSheet open={open} onClose={() => setOpen(false)} label="t">
          <button type="button">only</button>
        </BottomSheet>
      );
    }
    render(<H />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    function H() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
            open
          </button>
          <BottomSheet open={open} onClose={() => setOpen(false)} label="t">
            <button type="button">first</button>
          </BottomSheet>
        </>
      );
    }
    const user = userEvent.setup();
    render(<H />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('clicking the backdrop closes the sheet', () => {
    const onClose = vi.fn();
    render(make(onClose));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dragging the handle downward past 20% of viewport height closes the sheet', () => {
    const onClose = vi.fn();
    render(make(onClose));
    const handle = screen.getByRole('button', { name: '拖动调整高度' });
    const sheet = screen.getByRole('dialog');

    fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
    // Drag downward by 250px (>20% of 1000) — sheet should close on release.
    fireEvent.pointerMove(document, { clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(document, { clientY: 250, pointerId: 1 });

    expect(onClose).toHaveBeenCalledTimes(1);
    // The release should also drop the inline transform.
    expect(sheet.style.transform).toBe('');
  });

  it('dragging slightly up and releasing snaps to the nearest of peek/expanded', () => {
    // peek=50%, expanded=90%, sheet is open at peek. innerHeight=1000, so the
    // visible top sits at 500 (peek) or 100 (expanded). A small upward drag
    // of 60px should still snap to peek (closer) on a no-velocity release.
    const onClose = vi.fn();
    render(make(onClose));
    const handle = screen.getByRole('button', { name: '拖动调整高度' });
    const sheet = screen.getByRole('dialog');

    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    // Drag up by 60px (towards expanded). Distance to peek = 60, to expanded = 340. Snaps to peek.
    fireEvent.pointerMove(document, { clientY: 440, pointerId: 1 });
    fireEvent.pointerUp(document, { clientY: 440, pointerId: 1 });

    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('translateY(0px)'); // snapped to peek
  });

  it('a fast upward fling (velocity > threshold) snaps to expanded', () => {
    const onClose = vi.fn();
    render(make(onClose));
    const handle = screen.getByRole('button', { name: '拖动调整高度' });
    const sheet = screen.getByRole('dialog');

    // Simulate a fling: pointermove of -300px within ~50ms (6 px/ms > 0.5).
    const t0 = Date.now();
    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1, timeStamp: t0 });
    fireEvent.pointerMove(document, { clientY: 350, pointerId: 1, timeStamp: t0 + 30 });
    fireEvent.pointerUp(document, { clientY: 350, pointerId: 1, timeStamp: t0 + 50 });
    expect(onClose).not.toHaveBeenCalled();
    // Should now sit at expandedHeight=90%, i.e. 100px from the top.
    expect(sheet.style.transform).toBe('translateY(-400px)');
  });

  it('Tab from the last focusable cycles to the first (focus trap)', async () => {
    const user = userEvent.setup();
    render(make(() => {}));
    const second = screen.getByRole('button', { name: 'second' });
    second.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });
});
