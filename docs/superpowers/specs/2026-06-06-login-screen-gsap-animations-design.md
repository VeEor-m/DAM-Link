# Login Screen — GSAP Animations Design

> **Status:** Approved by user 2026-06-06.
> **Scope:** `packages/web/src/components/auth/LoginScreen.{tsx,module.css}` + two new files under `packages/web/src/lib/`. No backend or API changes. No other components touched.

## 1. Problem

The redesigned `LoginScreen` (Plan 10, commit `a69fd24`) is visually composed but motionless. It renders instantly when the route mounts, and the login↔register mode switch uses a single CSS keyframe (`@keyframes fieldIn`) that just animates the Name field. The result feels static for a magazine-cover entry point — the editorial copy ("An archive, organized.") and the staged cover composition imply a moment of arrival, but the page just appears.

GSAP gives us timeline-grade motion that can stage the cover composition in the same voice: slow, soft, ease-out. CSS keyframes can do one thing; GSAP can do a sequenced entrance plus a choreographed mode switch without losing the editorial calm.

## 2. Goal

Make the login page **arrive** — the cover composition assembles itself in roughly 1.5 seconds, and switching to register feels like a layout shift, not a DOM swap. Specifically:

- On mount: corner marks → meta → headline → sub → hairline rule → form fields → button, in a single timeline with a coherent easing vocabulary.
- On mode switch: sub copy crossfades, button label swaps instantly, and (if entering register) the Name field slides in.
- Editorial calm voice: `power3.out` / `power2.out`, 400–800ms durations, no overshoot, no bounce, no shake.
- Zero new design tokens. Zero breaking changes to the public API.
- `prefers-reduced-motion: reduce` honored: animations do not run; elements appear at their final state.

## 3. Design decisions (confirmed with user)

| Dimension | Choice | Rationale |
|---|---|---|
| Target page | `LoginScreen` only | The redesigned entry point; highest visibility. |
| Personality | Editorial calm | User-selected. Matches the existing magazine-cover aesthetic. |
| Trigger scope | Mount entrance + mode switch only | User selected. Explicitly NOT form micro-interactions or easter eggs. |
| Architecture | Separate animation module + `useGSAP` hook | User selected option B. Modular, testable, future-proof for other pages. |
| Library | `gsap` (free, MIT) + `@gsap/react` (free, MIT) | Zero-cost, well-supported, official React 18+ integration. ~50KB gzipped core, tree-shaken. |
| Headline animation | Whole-headline fade, not per-character | SplitText is a paid Club GreenSock plugin. Editorial calm doesn't need per-char chaos. |
| Reduced motion | Skip the timeline entirely (not "play a 0ms tween") | Cleaner. Elements appear at their final state immediately. |

## 4. Architecture & file changes

### 4.1 New dependency

```jsonc
// packages/web/package.json
{
  "dependencies": {
    "gsap": "^3.13.0",
    "@gsap/react": "^2.1.2"
  }
}
```

`@gsap/react` provides the `useGSAP` hook that wires `gsap.context()` to React's lifecycle. `gsap` core is tree-shaken by Vite (only the parts we import remain in the bundle).

### 4.2 New file: `packages/web/src/lib/gsap-setup.ts`

```ts
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// Register the React integration. No other plugins are needed yet.
// ScrollTrigger, SplitText, etc. are out of scope for this plan.
gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

// Motion vocabulary — the only place these numbers live.
export const GSAP_DURATIONS = {
  slow: 0.8,     // hero elements (headline)
  medium: 0.5,   // secondary copy, form fields
  fast: 0.35,    // mode-switch sub copy crossfade
  micro: 0.25,   // button/switch fade-in
} as const;

export const GSAP_EASING = {
  enter: 'power3.out',  // mount entrance primary
  enterSoft: 'power2.out',
  inOut: 'power2.inOut', // mode switch
} as const;
```

### 4.3 New file: `packages/web/src/lib/animations/login-screen.ts`

Pure factory functions. Each takes an `Element` (the card root) and returns a `gsap.core.Timeline`. The component is responsible for `.play()` via `useGSAP`; the factories do not autoplay.

```ts
import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

export type LoginMode = 'login' | 'register';

export function createMountEntrance(card: Element): gsap.core.Timeline {
  return gsap.timeline({ paused: true })
    // 1. Corner marks
    .from(card.querySelectorAll('[data-anim="corner"]'), {
      opacity: 0, y: -6, duration: GSAP_DURATIONS.medium, ease: GSAP_EASING.enter,
    }, 0)
    // 2. Meta line
    .from(card.querySelector('[data-anim="meta"]'), {
      opacity: 0, y: -4, duration: GSAP_DURATIONS.medium, ease: GSAP_EASING.enterSoft,
    }, 0.15)
    // 3. Headline (whole)
    .from(card.querySelector('[data-anim="headline"]'), {
      opacity: 0, y: 8, duration: GSAP_DURATIONS.slow, ease: GSAP_EASING.enter,
    }, 0.30)
    // 4. Sub copy
    .from(card.querySelector('[data-anim="sub"]'), {
      opacity: 0, y: 4, duration: GSAP_DURATIONS.medium, ease: GSAP_EASING.enterSoft,
    }, 0.55)
    // 5. Hairline rule (scaleX from left)
    .from(card.querySelector('[data-anim="rule"]'), {
      scaleX: 0, transformOrigin: 'left center', duration: 0.6, ease: GSAP_EASING.enterSoft,
    }, 0.75)
    // 6. Form fields (stagger)
    .from(card.querySelectorAll('[data-anim="field"]'), {
      opacity: 0, y: 6, duration: GSAP_DURATIONS.medium, ease: GSAP_EASING.enterSoft, stagger: 0.10,
    }, 0.95)
    // 7. Button + switch
    .from(card.querySelector('[data-anim="footer"]'), {
      opacity: 0, duration: GSAP_DURATIONS.micro, ease: GSAP_EASING.enterSoft,
    }, 1.30);
}

export function createModeSwitchTimeline(
  card: Element,
  from: LoginMode,
  to: LoginMode,
): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true });

  // Sub copy crossfade: old text rises 4px and fades, new text enters from below.
  // The data-anim="sub" element holds the new copy; the old copy is already
  // unmounted by React (key=mode on the <p>). So we only animate the new sub in.
  tl.from(card.querySelector('[data-anim="sub"]'), {
    opacity: 0, y: 4, duration: GSAP_DURATIONS.fast, ease: GSAP_EASING.inOut,
  });

  // Name field insertion (only when entering register).
  if (to === 'register') {
    tl.from(card.querySelector('[data-anim="name-field"]'), {
      opacity: 0, y: -6, height: 0, duration: 0.35, ease: GSAP_EASING.inOut,
    }, '<0.1'); // overlap 100ms with the sub copy
  }

  return tl;
}
```

### 4.4 Modified: `packages/web/src/components/auth/LoginScreen.tsx`

- Add a `cardRef = useRef<HTMLElement>(null)`.
- Add `data-anim="..."` attributes to each animated element (cornerTL, cornerBR, meta, headline, sub, rule, fields, footer row, name-field).
- Two `useGSAP` calls:
  1. **Mount entrance** — runs once on mount, uses `gsap.matchMedia` to gate on `prefers-reduced-motion: no-preference`.
  2. **Mode switch** — depends on `[mode]`, replays when mode flips.
- `useGSAP` handles cleanup: it kills the timeline on unmount and on dependency change.

```tsx
import { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createMountEntrance, createModeSwitchTimeline } from '../../lib/animations/login-screen.js';
// ... existing imports

const cardRef = useRef<HTMLElement>(null);

// 1. Mount entrance — runs once, respects reduced motion.
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      if (!cardRef.current) return;
      const tl = createMountEntrance(cardRef.current);
      tl.play(0);
    });
    // In reduced motion: do nothing — elements render at their final state
    // because the existing CSS .field rule (or the React-rendered DOM) shows
    // them with opacity 1 by default.
    return () => mm.revert();
  },
  { scope: cardRef },
);

// 2. Mode switch — replays on mode change.
useGSAP(
  () => {
    if (!cardRef.current) return;
    const tl = createModeSwitchTimeline(cardRef.current, prevModeRef.current, mode);
    tl.play(0);
    prevModeRef.current = mode;
  },
  { scope: cardRef, dependencies: [mode] },
);
```

The mode-switch timeline needs to know the previous mode. We use a `useRef` to track it (`prevModeRef`) since `useGSAP`'s `dependencies` array doesn't expose the previous value.

### 4.5 Modified: `packages/web/src/components/auth/LoginScreen.module.css`

- **Remove** `.fieldAnimated` and `@keyframes fieldIn` (the Name-field CSS animation is now driven by GSAP).
- **Remove** the `prefers-reduced-motion: reduce` block that overrode `.fieldAnimated` (no longer needed).
- All other styles are unchanged.

The GSAP timeline sets the final `opacity: 1, y: 0, scaleX: 1, height: auto` on each animated element. The elements' default state in CSS remains `opacity: 1, transform: none` so that reduced-motion users (and no-JS environments) see the page at its final state immediately.

### 4.6 Unchanged

- `src/api/auth.ts`, `src/api/client.ts` — the functions GSAP never touches.
- `src/App.tsx` (consumer) — public signature `{ onSuccess }` preserved.
- `src/styles/tokens.css` — no new tokens.
- `src/styles/global.css` — global `:focus-visible` and other rules preserved.

## 5. Animation timeline (the actual content)

### 5.1 Mount entrance

```
t=0.00s ┌─ Corner marks (TL, BR) ───────┐ opacity 0→1, y -6→0, 0.5s, power3.out
t=0.15s │  Meta line ("VOL. 01...") ───│ opacity 0→1, y -4→0, 0.5s, power2.out
t=0.30s │  Headline ("An archive...") ─│ opacity 0→1, y +8→0, 0.8s, power3.out
t=0.55s │  Sub copy ───────────────────│ opacity 0→1, y +4→0, 0.5s, power2.out
t=0.75s │  Hairline rule ──────────────│ scaleX 0→1, left origin, 0.6s, power2.out
t=0.95s │  Form fields (stagger 0.1s) ─│ opacity 0→1, y +6→0, 0.5s each, power2.out
t=1.30s └─ Footer row (switch + btn) ──┘ opacity 0→1, 0.35s, power2.out
```

Total runtime: ~1.65s. The page is interactive from t=0 (no `pointer-events: none`); the user can click the switch or button while the entrance is still running. Doing so cancels the remaining tweens via `useGSAP`'s automatic context revert (a future enhancement: explicitly call `tl.kill()` in the click handler — out of scope for this plan).

### 5.2 Mode switch (login ↔ register)

Two sub-timelines, both ~0.35s:

**A. Sub copy crossfade.** The React render swaps the `<p data-anim="sub">` text in the same DOM node (the `mode` state changes the text, not the node). GSAP fades the new copy in from `opacity: 0, y: 4` over 0.35s with `power2.inOut`. The "out" half of the crossfade happens naturally because the old text is no longer rendered — visually this reads as a smooth entry because the new copy rises into the same position the old one occupied.

**B. Name field insertion (login → register only).** The Name `<div data-anim="name-field">` was just added by React. GSAP animates it from `opacity: 0, y: -6, height: 0` to its natural state over 0.35s, overlapping the sub copy animation by 0.1s.

**C. Going register → login.** Only A applies (no field to remove; the Name field simply unmounts).

### 5.3 Easing vocabulary (recap)

| Easing | When |
|---|---|
| `power3.out` | Hero elements — headline, corner marks. Slower end, more "settling" feel. |
| `power2.out` | Secondary copy, form fields. The workhorse ease for editorial calm. |
| `power2.inOut` | Mode switch — needs symmetry for crossfade-like motion. |
| `power1.out` | Footer micro-fade. The least "weighted" element. |

No `bounce`, no `elastic`, no overshoot. The whole point is "calm".

## 6. Reduced motion & accessibility

- `gsap.matchMedia()` checks `(prefers-reduced-motion: no-preference)` before scheduling any tween. In reduced-motion mode, the timeline is never created, and the elements render at their final state from the React render.
- All animations use `transform` (translate / scale) and `opacity` only. No layout-triggering properties.
- `useGSAP` from `@gsap/react` automatically creates a `gsap.Context`, kills all tweens on unmount, and on dependency change. No memory leaks.
- The screen-reader experience is unchanged: the form has `aria-busy={busy}` (still works), the error region has `role="alert"` (still works), the switch is `<button type="button">` (still works). The animations are purely visual.
- The 4 new tests cover (1) mount with normal motion, (2) mount with reduced motion, (3) mode switch with normal motion, (4) cleanup on unmount.

## 7. Testing

Add 4 tests to the existing `packages/web/tests/LoginScreen.test.tsx`:

1. **Mount entrance runs on initial render** — set `prefers-reduced-motion: no-preference` via `Object.defineProperty(window, 'matchMedia', ...)`, mount, advance fake timers by 2000ms, assert `getComputedStyle(card.querySelector('[data-anim="headline"]')).opacity === '1'`.
2. **Mount entrance is skipped under reduced motion** — same as above but `prefers-reduced-motion: reduce`, advance 0ms, assert elements are at their final opacity immediately (the React render shows them, no tween was scheduled).
3. **Mode switch plays the crossfade** — start with the mount-entrance advance done, click "Register", advance 400ms, assert the new sub copy's `opacity === '1'`.
4. **Cleanup on unmount** — mount, unmount before the timeline completes, assert no `act()` warnings and no pending `requestAnimationFrame` callbacks (or just: a second mount works without "duplicate timeline" errors).

Test setup uses `vi.useFakeTimers()` and `vi.advanceTimersByTime()`. The existing 12 tests in `LoginScreen.test.tsx` continue to pass unchanged because they assert behavior, not animation.

## 8. Out of scope (explicit)

- **Other pages** (Sidebar / Browser / Detail) — different conversation, different plan.
- **Form micro-interactions** (focus underline bounce, error shake, button shimmer) — user said no.
- **Easter eggs** — user said no.
- **Per-character headline reveal** — would need Club GreenSock (`SplitText`) or a hand-rolled splitter; editorial calm doesn't require it.
- **ScrollTrigger** — login page has no scroll.
- **New design tokens** — motion vocabulary lives in `gsap-setup.ts` as JS constants. Promoting to CSS custom properties is a future enhancement if a second component needs them.
- **Animating the page transition between login and the main app** — that's a router concern, not a `LoginScreen` concern.
- **Replacing the existing `prefers-reduced-motion: reduce` rule in `global.css`** — that's a global concern. The local override in `LoginScreen.module.css` goes away (no longer needed); the global one stays.

## 9. Acceptance criteria

The change is done when:

1. `pnpm -F @dam-link/web install --frozen-lockfile` succeeds with the two new dependencies.
2. `pnpm -F @dam-link/web exec tsc -b` reports zero errors.
3. `pnpm -F @dam-link/web lint` reports zero NEW errors (pre-existing 7 errors in unrelated files stay untouched).
4. All 12 existing `LoginScreen.test.tsx` tests still pass.
5. All 4 new tests in §7 pass.
6. `pnpm -F @dam-link/web test` is fully green (23+ suites, 192+ tests).
7. With `prefers-reduced-motion: no-preference`, the mount entrance is visibly staged in a browser at `http://localhost:5173` (verified via a 2-second Playwright screenshot of the in-progress and final state).
8. With `prefers-reduced-motion: reduce`, the page appears at its final state with no animation.
9. Clicking the "Register" switch animates the sub copy crossfade and the Name field insertion smoothly.
10. Files changed: only `LoginScreen.tsx`, `LoginScreen.module.css`, `LoginScreen.test.tsx`, plus the two new files under `src/lib/`, plus the `package.json` dependency entries. No other source files.
