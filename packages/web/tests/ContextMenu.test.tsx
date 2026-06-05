import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, type ContextMenuItem } from '../src/components/common/ContextMenu';

function makeItems(): ContextMenuItem[] {
  return [
    { key: 'a', label: 'Alpha', onClick: vi.fn() },
    { key: 'div1', label: '', divider: true },
    { key: 'b', label: 'Bravo', onClick: vi.fn() },
    { key: 'c', label: 'Charlie', onClick: vi.fn(), disabled: true },
    { key: 'div2', label: '', divider: true },
    { key: 'd', label: 'Delta', onClick: vi.fn(), danger: true },
  ];
}

function Harness({
  items,
  onClose,
  open = true,
}: {
  items: ContextMenuItem[];
  onClose: () => void;
  open?: boolean;
}) {
  // Use a state-backed ref so the trigger element is available on the second
  // render (after the callback ref is invoked) — passing `ref.current` at
  // render time is always null on mount.
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        ref={setTriggerEl}
        data-testid="trigger"
      >
        trigger
      </button>
      <ContextMenu
        anchor={open ? { x: 0, y: 0 } : null}
        items={items}
        onClose={onClose}
        triggerRef={triggerEl}
      />
    </>
  );
}

describe('ContextMenu', () => {
  it('renders nothing when anchor is null', () => {
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} open={false} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders a menu with menuitems and separators', () => {
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Alpha, Bravo, Charlie(disabled), Delta — disabled items still render as
    // menuitem with disabled attribute, so they count for role queries.
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('auto-focuses the first focusable item on open', () => {
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus(); // Alpha
  });

  it('skips dividers and disabled items in keyboard navigation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    // Focus is on Alpha. ArrowDown should land on Bravo (skipping div1).
    await user.keyboard('{ArrowDown}');
    const items = screen.getAllByRole('menuitem');
    expect(items[1]).toHaveFocus(); // Bravo
    // Another ArrowDown should skip disabled Charlie and land on Delta.
    await user.keyboard('{ArrowDown}');
    expect(items[3]).toHaveFocus(); // Delta
  });

  it('ArrowUp wraps from the first focusable item to the last', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    // Focus is on Alpha (first). ArrowUp should wrap to Delta (last focusable).
    await user.keyboard('{ArrowUp}');
    const items = screen.getAllByRole('menuitem');
    expect(items[3]).toHaveFocus(); // Delta
  });

  it('Home jumps to the first focusable item', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    await user.keyboard('{End}');
    const items = screen.getAllByRole('menuitem');
    expect(items[3]).toHaveFocus(); // Delta
    await user.keyboard('{Home}');
    expect(items[0]).toHaveFocus(); // Alpha
  });

  it('End jumps to the last focusable item', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    await user.keyboard('{End}');
    const items = screen.getAllByRole('menuitem');
    expect(items[3]).toHaveFocus(); // Delta
  });

  it('Enter activates the focused item and closes the menu', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    await user.keyboard('{Enter}'); // Alpha is focused
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Space activates the focused item and closes the menu', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    await user.keyboard(' '); // Space
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls the item onClick handler when activated', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    // items[2] is Bravo (index 0=Alpha, 1=div1, 2=Bravo, 3=Charlie, 4=div2, 5=Delta).
    const items = makeItems();
    const bravoOnClick = items[2].onClick as ReturnType<typeof vi.fn>;
    render(<Harness items={items} onClose={onClose} />);
    await user.keyboard('{ArrowDown}'); // Focus Bravo
    await user.keyboard('{Enter}');
    expect(bravoOnClick).toHaveBeenCalledTimes(1);
  });

  it('Esc closes the menu and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    const trigger = screen.getByTestId('trigger');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('Tab closes the menu (no focus trap)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness items={makeItems()} onClose={onClose} />);
    await user.keyboard('{Tab}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pointerdown outside the menu closes it and restores focus', () => {
    const onClose = vi.fn();
    render(
      <>
        <button type="button" data-testid="outside">
          outside
        </button>
        <Harness items={makeItems()} onClose={onClose} />
      </>,
    );
    const trigger = screen.getByTestId('trigger');
    // Dispatch a real pointerdown on the outside button so the document-level
    // listener (registered by ContextMenu) sees it.
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('disabled menuitem does not invoke its onClick when activated', async () => {
    const user = userEvent.setup();
    const disabledOnClick = vi.fn();
    const items: ContextMenuItem[] = [
      { key: 'a', label: 'A', onClick: disabledOnClick, disabled: true },
      { key: 'b', label: 'B', onClick: vi.fn() },
    ];
    const onClose = vi.fn();
    render(<Harness items={items} onClose={onClose} />);
    // Auto-focus lands on B (first focusable). Walk back to A with ArrowUp
    // (which wraps to the last focusable, B) — no, that won't reach A.
    // Instead, focus A directly. The browser blocks click on disabled buttons.
    const menuitems = screen.getAllByRole('menuitem');
    menuitems[0].focus();
    expect(menuitems[0]).toBeDisabled();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(disabledOnClick).not.toHaveBeenCalled();
  });

  it('does not focus anything if every item is disabled', () => {
    const items: ContextMenuItem[] = [
      { key: 'a', label: 'A', onClick: vi.fn(), disabled: true },
      { key: 'b', label: 'B', onClick: vi.fn(), disabled: true },
    ];
    const onClose = vi.fn();
    render(<Harness items={items} onClose={onClose} />);
    const buttons = screen.getAllByRole('menuitem');
    expect(buttons.some((b) => b === document.activeElement)).toBe(false);
  });

  it('still works without a triggerRef prop', async () => {
    // Verifies the optional triggerRef does not break backward compatibility.
    const onClose = vi.fn();
    render(
      <ContextMenu
        anchor={{ x: 0, y: 0 }}
        items={[{ key: 'a', label: 'A', onClick: vi.fn() }]}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    // Escape should not throw even without a triggerRef.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
