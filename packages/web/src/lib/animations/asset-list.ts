import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * Whole-list fade for the list view. Replayed by AssetList on user-initiated
 * `visibleAssets` changes. The first invocation on mount is gated out by
 * `useIsFirstMount`.
 *
 * No per-row stagger — a 50-row list staggering at 0.05s is ~2.5s of motion,
 * which is too slow and feels broken.
 *
 * Returns a PAUSED timeline; the caller plays it.
 * If `rows` is empty, returns a paused empty timeline.
 */
export function createAssetListFade(
  listEl: Element,
  _rows: Element[],
): gsap.core.Timeline {
  if (_rows.length === 0) {
    return gsap.timeline({ paused: true });
  }
  // Wrap gsap.from() in a timeline so the return type matches
  // gsap.core.Timeline (gsap.from() alone returns gsap.core.Tween, which
  // has no .getChildren() and breaks the test contract).
  return gsap.timeline({ paused: true }).from(listEl, {
    opacity: 0,
    duration: GSAP_DURATIONS.medium,
    ease: GSAP_EASING.enterSoft,
  });
}
