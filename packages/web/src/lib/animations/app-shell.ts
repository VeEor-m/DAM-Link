import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * One-time AppShell mount entrance. Fires after login completes.
 *
 * Animates, in order:
 *   0.0s  toolbar   y -8  → 0, opacity 0 → 1, slow, enter
 *   0.0s  sidebar   x -16 → 0, opacity 0 → 1, medium, enter   (parallel with toolbar)
 *   0.1s  main      opacity 0 → 1, medium, enterSoft
 *   0.15s detail    x 16  → 0, opacity 0 → 1, medium, enter
 *   0.3s  cards     y 6   → 0, opacity 0 → 1, medium, enterSoft, 0.05s stagger
 *
 * Returns a PAUSED timeline; the caller plays it via `.play(0)`.
 * All selectors are scoped to the shell element, so multiple shells on a page
 * are safe.
 *
 * If a selector matches nothing (e.g. no cards on a fresh login), the
 * corresponding `.from()` is a no-op (GSAP handles empty NodeLists).
 */
export function createAppShellMountEntrance(shellEl: Element): gsap.core.Timeline {
  return gsap
    .timeline({ paused: true })
    .from(shellEl.querySelectorAll('[data-anim="toolbar-row"]'), {
      opacity: 0,
      y: -8,
      duration: GSAP_DURATIONS.slow,
      ease: GSAP_EASING.enter,
    }, 0)
    .from(shellEl.querySelectorAll('[data-anim="sidebar-col"]'), {
      opacity: 0,
      x: -16,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enter,
    }, 0)
    .from(shellEl.querySelector('[data-anim="main"]'), {
      opacity: 0,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enterSoft,
    }, 0.1)
    .from(shellEl.querySelectorAll('[data-anim="detail-panel"]'), {
      opacity: 0,
      x: 16,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enter,
    }, 0.15)
    .from(shellEl.querySelectorAll('[data-anim="card"]'), {
      opacity: 0,
      y: 6,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enterSoft,
      stagger: 0.05,
    }, 0.3);
}
