import { describe, it, expect } from 'vitest';
import { createAppShellMountEntrance } from '../../src/lib/animations/app-shell';

function makeShell(): HTMLElement {
  const shell = document.createElement('div');
  shell.innerHTML = `
    <div data-anim="toolbar-row"></div>
    <nav data-anim="sidebar-col"></nav>
    <main data-anim="main"></main>
    <aside data-anim="detail-panel"></aside>
    <div data-anim="card"></div>
    <div data-anim="card"></div>
  `;
  return shell;
}

describe('createAppShellMountEntrance', () => {
  it('returns a paused gsap timeline', () => {
    const tl = createAppShellMountEntrance(makeShell());
    expect(tl.paused()).toBe(true);
  });

  it('targets the four frame containers and the cards (5 tweens: 4 frame + 1 card stagger)', () => {
    const tl = createAppShellMountEntrance(makeShell());
    // The factory has 5 .from() calls (toolbar, sidebar, main, detail, cards).
    // GSAP's .from(cards, { stagger: 0.05 }) returns a single stagger tween
    // wrapping all matched elements — not 1 tween per element — so the
    // timeline has 5 direct children, not 6.
    const children = tl.getChildren(false, true, false);
    expect(children.length).toBe(5);
  });

  it('does not throw when the shell is empty', () => {
    const empty = document.createElement('div');
    expect(() => createAppShellMountEntrance(empty)).not.toThrow();
    const tl = createAppShellMountEntrance(empty);
    expect(tl.paused()).toBe(true);
    // GSAP's .from(emptySelector, ...) still creates a tween (with a
    // console warning), so the timeline has the same 5 children regardless
    // of whether any selectors matched. The "no-throw" check is what
    // actually exercises the empty-shell path.
  });
});
