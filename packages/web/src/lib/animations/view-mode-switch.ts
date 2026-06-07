import { gsap, GSAP_EASING } from '../gsap-setup.js';

/**
 * Crossfade between the grid and list views. The browser slot fades to
 * opacity 0 over 0.2s, calls `onMidpoint` so the React tree can swap the
 * rendered child, then fades back to opacity 1 over 0.2s. Total: 0.4s.
 *
 * Returns a PAUSED timeline; the caller plays it. The `onMidpoint` callback
 * runs synchronously inside the GSAP scheduler at the 0.2s mark.
 */
export function createViewModeSwitchTimeline(
  browserEl: Element,
  onMidpoint: () => void,
): gsap.core.Timeline {
  return gsap
    .timeline({ paused: true })
    .to(browserEl, {
      opacity: 0,
      duration: 0.2,
      ease: GSAP_EASING.inOut,
    })
    .call(onMidpoint, [], '<') // '<' = start of next tween, which is the in-half
    .fromTo(
      browserEl,
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.2,
        ease: GSAP_EASING.inOut,
      },
    );
}
