import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// Re-export both. As of @gsap/react 2.x, no `gsap.registerPlugin(useGSAP)` call
// is needed — the hook manages its own gsap.Context lifecycle.
// ScrollTrigger, SplitText, etc. are out of scope for this plan.
export { gsap, useGSAP };

// Motion vocabulary — the only place these numbers live.
// (No CSS custom properties for these: motion is JS, not style.)
export const GSAP_DURATIONS = {
  slow: 0.8,            // hero elements (headline)
  medium: 0.5,          // secondary copy, form fields
  fast: 0.35,           // mode-switch sub copy crossfade
  micro: 0.25,          // button/switch fade-in
  'medium-slow': 0.4,   // view-mode crossfade, detail panel open/close, BottomSheet open/close
} as const;

export const GSAP_EASING = {
  enter: 'power3.out',     // mount entrance primary
  enterSoft: 'power2.out', // mount entrance secondary
  inOut: 'power2.inOut',   // mode switch
} as const;
