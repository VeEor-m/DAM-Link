import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * Side detail panel (desktop / wide). Slides in from the right.
 * - open:  x 24 → 0, opacity 0 → 1, medium-slow, enter
 * - close: x 0  → 24, opacity 1 → 0, medium-slow, inOut
 *
 * Returns a PAUSED timeline; the caller plays it.
 */
export function createSideDetailPanelTimeline(
  panelEl: Element,
  direction: 'open' | 'close',
): gsap.core.Timeline {
  if (direction === 'open') {
    return gsap.timeline({ paused: true }).from(panelEl, {
      opacity: 0,
      x: 24,
      duration: GSAP_DURATIONS['medium-slow'],
      ease: GSAP_EASING.enter,
    });
  }
  return gsap.timeline({ paused: true }).to(panelEl, {
    opacity: 0,
    x: 24,
    duration: GSAP_DURATIONS['medium-slow'],
    ease: GSAP_EASING.inOut,
  });
}

/**
 * Bottom sheet (phone detail panel). Slides up from the bottom.
 * - open:  yPercent 100 → 0, opacity 0 → 1, medium-slow, enter
 * - close: yPercent 0   → 100, opacity 1 → 0, medium-slow, inOut
 *
 * yPercent is preferred over y so the sheet is positioned via CSS transform
 * without us needing to know its computed height. The CSS `transform`
 * property is preserved at rest (transform: ''), so the sheet does not
 * displace layout while the animation is paused.
 *
 * Returns a PAUSED timeline; the caller plays it.
 */
export function createBottomSheetTimeline(
  sheetEl: Element,
  direction: 'open' | 'close',
): gsap.core.Timeline {
  if (direction === 'open') {
    return gsap.timeline({ paused: true }).from(sheetEl, {
      opacity: 0,
      yPercent: 100,
      duration: GSAP_DURATIONS['medium-slow'],
      ease: GSAP_EASING.enter,
    });
  }
  return gsap.timeline({ paused: true }).to(sheetEl, {
    opacity: 0,
    yPercent: 100,
    duration: GSAP_DURATIONS['medium-slow'],
    ease: GSAP_EASING.inOut,
  });
}
