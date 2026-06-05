import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../src/components/common/Modal';

function Harness({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        open
      </button>
      <Modal open={open} title="t" onClose={() => setOpen(false)}>
        {children}
      </Modal>
    </>
  );
}

describe('Modal FOCUSABLE selector (N1)', () => {
  it('skips a leading disabled button and focuses the first enabled focusable', () => {
    render(
      <Harness>
        <button type="button" disabled data-testid="disabled-first">
          disabled
        </button>
        <button type="button" data-testid="enabled-second">
          enabled
        </button>
      </Harness>,
    );
    expect(screen.getByTestId('disabled-first')).not.toHaveFocus();
    expect(screen.getByTestId('enabled-second')).toHaveFocus();
  });

  it('skips hidden inputs (type="hidden")', () => {
    render(
      <Harness>
        <input type="hidden" data-testid="hidden-input" />
        <button type="button" data-testid="after-hidden">
          after
        </button>
      </Harness>,
    );
    expect(screen.getByTestId('hidden-input')).not.toHaveFocus();
    expect(screen.getByTestId('after-hidden')).toHaveFocus();
  });

  it('skips disabled inputs, selects, and textareas', () => {
    render(
      <Harness>
        <input type="text" disabled data-testid="disabled-input" />
        <select disabled data-testid="disabled-select">
          <option>x</option>
        </select>
        <textarea disabled data-testid="disabled-textarea" />
        <button type="button" data-testid="after-disabled">
          after
        </button>
      </Harness>,
    );
    expect(screen.getByTestId('disabled-input')).not.toHaveFocus();
    expect(screen.getByTestId('disabled-select')).not.toHaveFocus();
    expect(screen.getByTestId('disabled-textarea')).not.toHaveFocus();
    expect(screen.getByTestId('after-disabled')).toHaveFocus();
  });

  it('skips <a> elements without an href', () => {
    render(
      <Harness>
        <a data-testid="plain-anchor">no href</a>
        <button type="button" data-testid="after-anchor">
          after
        </button>
      </Harness>,
    );
    expect(screen.getByTestId('plain-anchor')).not.toHaveFocus();
    expect(screen.getByTestId('after-anchor')).toHaveFocus();
  });

  it('Tab cycle wraps from last to first focusable, skipping disabled in between', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <button type="button" data-testid="btn-a">
          A
        </button>
        <button type="button" disabled data-testid="btn-disabled-mid">
          disabled
        </button>
        <button type="button" data-testid="btn-c">
          C
        </button>
      </Harness>,
    );
    const a = screen.getByTestId('btn-a');
    const c = screen.getByTestId('btn-c');
    expect(a).toHaveFocus();
    // Shift+Tab from first (A) should wrap to last focusable (C), skipping disabled.
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(c).toHaveFocus();
  });

  it('Escape closes the modal (regression — selector tightening must not break this)', async () => {
    const onClose = vi.fn();
    function H() {
      const [open, setOpen] = useState(true);
      return (
        <Modal open={open} title="t" onClose={() => { onClose(); setOpen(false); }}>
          <button type="button">only</button>
        </Modal>
      );
    }
    render(<H />);
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal focus restore (N2)', () => {
  it('restores focus to the trigger on close', async () => {
    function H() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button
            type="button"
            data-testid="trigger"
            onClick={() => setOpen(true)}
          >
            open
          </button>
          <Modal open={open} title="t" onClose={() => setOpen(false)}>
            <button type="button">inside</button>
          </Modal>
        </>
      );
    }
    render(<H />);
    const trigger = screen.getByTestId('trigger');
    // Simulate a real-world open: the user just clicked the trigger, so it had
    // focus when the modal mounted. (jsdom defaults activeElement to body.)
    trigger.focus();
    expect(trigger).toHaveFocus();
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('falls back to body when the trigger element is unmounted before close', async () => {
    function H() {
      const [open, setOpen] = useState(true);
      const [triggerAlive, setTriggerAlive] = useState(true);
      return (
        <>
          {triggerAlive && (
            <button
              type="button"
              data-testid="trigger"
              onClick={() => setOpen(true)}
            >
              open
            </button>
          )}
          <Modal
            open={open}
            title="t"
            onClose={() => {
              setOpen(false);
              setTriggerAlive(false);
            }}
          >
            <button type="button" data-testid="inside">
              inside
            </button>
            <button
              type="button"
              data-testid="kill-trigger"
              onClick={() => setTriggerAlive(false)}
            >
              kill
            </button>
          </Modal>
        </>
      );
    }
    render(<H />);
    // Unmount the trigger while the modal is still open.
    const kill = screen.getByTestId('kill-trigger');
    kill.click();
    // Now the trigger is gone; closing the modal should not throw, and focus
    // should land somewhere sensible (body) rather than on a detached node.
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    // We just assert no exception and that document.body is the active element.
    expect(document.activeElement).toBe(document.body);
  });
});
