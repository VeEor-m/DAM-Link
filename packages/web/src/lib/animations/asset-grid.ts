import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * Per-card stagger for the grid view. Replayed by AssetGrid on user-initiated
 * `visibleAssets` changes (search / filter / sidebar click). The first
 * invocation on mount is gated out by `useIsFirstMount` — the initial cards
 * are already animated by `createAppShellMountEntrance`.
 *
 * Returns a PAUSED timeline; the caller plays it.
 * If `cards` is empty, returns a paused empty timeline.
 */
export function createAssetGridStagger(
  _gridEl: Element,
  cards: Element[],
): gsap.core.Timeline {
  if (cards.length === 0) {
    return gsap.timeline({ paused: true });
  }
  // Wrap in a timeline (rather than returning the bare gsap.from() tween)
  // so the return type is consistently `gsap.core.Timeline` for callers that
  // call `.getChildren()`, `.play(0)`, etc. GSAP's .from(targets, {stagger})
  // returns a single Tween wrapping all targets, with stagger applied
  // internally — not one tween per target.
  return gsap.timeline({ paused: true }).from(cards, {
    opacity: 0,
    y: 6,
    duration: GSAP_DURATIONS.medium,
    ease: GSAP_EASING.enterSoft,
    stagger: 0.05,
  });
}
