import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

export type LoginMode = 'login' | 'register';

/**
 * Mount entrance: corner marks → meta → headline → sub → rule → fields → footer.
 * Returns a PAUSED timeline; the caller is responsible for `.play(0)`.
 * The elements are identified by `data-anim` attributes set on the JSX.
 */
export function createMountEntrance(card: Element): gsap.core.Timeline {
  return gsap
    .timeline({ paused: true })
    // 1. Corner marks (TL + BR) — 0.0s
    .from(card.querySelectorAll('[data-anim="corner"]'), {
      opacity: 0,
      y: -6,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enter,
    }, 0)
    // 2. Meta line — 0.15s
    .from(card.querySelector('[data-anim="meta"]'), {
      opacity: 0,
      y: -4,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enterSoft,
    }, 0.15)
    // 3. Headline (whole, not per-char) — 0.30s
    .from(card.querySelector('[data-anim="headline"]'), {
      opacity: 0,
      y: 8,
      duration: GSAP_DURATIONS.slow,
      ease: GSAP_EASING.enter,
    }, 0.3)
    // 4. Sub copy — 0.55s
    .from(card.querySelector('[data-anim="sub"]'), {
      opacity: 0,
      y: 4,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enterSoft,
    }, 0.55)
    // 5. Hairline rule (scaleX from left) — 0.75s
    .from(card.querySelector('[data-anim="rule"]'), {
      scaleX: 0,
      transformOrigin: 'left center',
      duration: 0.6,
      ease: GSAP_EASING.enterSoft,
    }, 0.75)
    // 6. Form fields (stagger 0.1s) — 0.95s
    .from(card.querySelectorAll('[data-anim="field"]'), {
      opacity: 0,
      y: 6,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enterSoft,
      stagger: 0.1,
    }, 0.95)
    // 7. Footer row (switch + button) — 1.30s
    .from(card.querySelector('[data-anim="footer"]'), {
      opacity: 0,
      duration: GSAP_DURATIONS.micro,
      ease: GSAP_EASING.enterSoft,
    }, 1.3);
}

/**
 * Mode switch: crossfade the sub copy; if entering register, slide the Name field in.
 * Returns a PAUSED timeline; the caller is responsible for `.play(0)`.
 *
 * The sub copy is identified by the same `[data-anim="sub"]` selector as the mount
 * entrance, but in this case the React render has just swapped the text content of
 * that <p>, so the GSAP `.from()` is what makes the new copy appear to "rise into"
 * the same position. The "out" half of the crossfade happens naturally because the
 * old text is no longer rendered.
 *
 * Returns an empty timeline when `from === to` (no-op for the initial render,
 * where both are 'login'). This keeps the mount-entrance and the mode-switch
 * timelines from animating the same element on the same render.
 */
export function createModeSwitchTimeline(
  card: Element,
  from: LoginMode,
  to: LoginMode,
): gsap.core.Timeline {
  if (from === to) {
    return gsap.timeline({ paused: true });
  }

  const tl = gsap.timeline({ paused: true });

  // Sub copy crossfade
  tl.from(card.querySelector('[data-anim="sub"]'), {
    opacity: 0,
    y: 4,
    duration: GSAP_DURATIONS.fast,
    ease: GSAP_EASING.inOut,
  });

  // Name field insertion (only when entering register)
  if (to === 'register') {
    tl.from(
      card.querySelector('[data-anim="name-field"]'),
      {
        opacity: 0,
        y: -6,
        height: 0,
        duration: 0.35,
        ease: GSAP_EASING.inOut,
      },
      '<0.1', // overlap 100ms with the sub copy
    );
  }

  return tl;
}
