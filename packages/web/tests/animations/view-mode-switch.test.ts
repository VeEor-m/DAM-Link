import { describe, it, expect, vi } from 'vitest';
import { createViewModeSwitchTimeline } from '../../src/lib/animations/view-mode-switch';

describe('createViewModeSwitchTimeline', () => {
  it('returns a paused timeline', () => {
    const browser = document.createElement('div');
    const tl = createViewModeSwitchTimeline(browser, () => {});
    expect(tl.paused()).toBe(true);
  });

  it('has 3 children: out-tween + .call() (counted as Tween by GSAP) + in-tween, totalling 0.4s', () => {
    // GSAP internally wraps .call() as a Tween, so getChildren surfaces all 3.
    // The .call() is instantaneous, so duration() reflects only the two 0.2s tweens.
    // (Verified empirically: getChildren(false, true, true).length === 3,
    //  getChildren(false, true, false).length === 3, duration() === 0.4)
    const browser = document.createElement('div');
    const onMid = vi.fn();
    const tl = createViewModeSwitchTimeline(browser, onMid);
    expect(tl.getChildren(false, true, true).length).toBe(3);
    expect(tl.duration()).toBe(0.4);
  });

  it('does not throw when browser is empty', () => {
    expect(() =>
      createViewModeSwitchTimeline(document.createElement('div'), () => {}),
    ).not.toThrow();
  });
});
