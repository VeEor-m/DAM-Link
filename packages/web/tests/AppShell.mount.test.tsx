import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AppShell } from '../src/components/layout/AppShell';

vi.mock('../src/lib/animations/app-shell.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createAppShellMountEntrance: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

import { createAppShellMountEntrance } from '../src/lib/animations/app-shell.js';

describe('AppShell mount entrance (T15)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true, // no-preference
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('calls createAppShellMountEntrance exactly once on first mount', () => {
    render(
      <AppShell
        toolbar={<div>toolbar</div>}
        sidebar={<div>sidebar</div>}
        browser={<div>browser</div>}
        detail={<div>detail</div>}
      />,
    );
    expect(createAppShellMountEntrance).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire on prop change (re-render)', () => {
    const { rerender } = render(
      <AppShell
        toolbar={<div>toolbar v1</div>}
        sidebar={<div>sidebar</div>}
        browser={<div>browser</div>}
        detail={<div>detail</div>}
      />,
    );
    expect(createAppShellMountEntrance).toHaveBeenCalledTimes(1);

    rerender(
      <AppShell
        toolbar={<div>toolbar v2</div>}
        sidebar={<div>sidebar</div>}
        browser={<div>browser</div>}
        detail={<div>detail</div>}
      />,
    );
    expect(createAppShellMountEntrance).toHaveBeenCalledTimes(1); // still 1
  });
});
