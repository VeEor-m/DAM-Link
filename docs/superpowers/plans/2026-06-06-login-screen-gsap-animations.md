# Login Screen GSAP Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single CSS keyframe (`@keyframes fieldIn`) in `LoginScreen` with a GSAP-driven mount-entrance sequence and mode-switch timeline, in the same "editorial calm" voice as the existing design. New dependency: `gsap` + `@gsap/react`. No new design tokens. Public `LoginScreen({ onSuccess })` API preserved.

**Architecture:** Two new files under `packages/web/src/lib/` (`gsap-setup.ts` re-exports + motion vocabulary; `animations/login-screen.ts` pure timeline factories). Two `useGSAP` calls in `LoginScreen.tsx`: one for the mount entrance (gated on `prefers-reduced-motion: no-preference` via `gsap.matchMedia`), one for the mode switch (re-runs on `mode` change). Existing 12 `LoginScreen.test.tsx` tests stay unchanged. Four new tests verify the animation behavior via factory mocks + DOM assertions. The redundant `.fieldAnimated` CSS class + `@keyframes fieldIn` are removed from `LoginScreen.module.css`.

**Tech Stack:** React 19, TypeScript 5.6 strict, GSAP 3.13+ + `@gsap/react` 2.x (both MIT, free), Vitest 4 + React Testing Library 16 + `vi.useFakeTimers`, Playwright (via `webapp-testing` skill) for visual verification.

**Spec:** `docs/superpowers/specs/2026-06-06-login-screen-gsap-animations-design.md` (commits `43ad552` + `3133b4c`).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/web/src/lib/gsap-setup.ts` | **Create** | Re-export `gsap` + `useGSAP`. Define `GSAP_DURATIONS` and `GSAP_EASING` constants. The only place motion numbers live. |
| `packages/web/src/lib/animations/login-screen.ts` | **Create** | Pure factory functions: `createMountEntrance(card)` and `createModeSwitchTimeline(card, from, to)`. Each returns a paused `gsap.core.Timeline`. Export `LoginMode` type. |
| `packages/web/src/components/auth/LoginScreen.tsx` | **Modify** | Add `cardRef` + `prevModeRef` + `data-anim` attributes + two `useGSAP` calls. Public signature unchanged. |
| `packages/web/src/components/auth/LoginScreen.module.css` | **Modify** | Remove `.fieldAnimated`, `@keyframes fieldIn`, and the local `prefers-reduced-motion: reduce` override (no longer needed). |
| `packages/web/tests/LoginScreen.test.tsx` | **Modify** | Add 2 describe blocks (T5 mount entrance, T6 mode switch + cleanup) with 4 new tests. |
| `packages/web/package.json` | **Modify** | Add `gsap` (^3.13.0) and `@gsap/react` (^2.1.2) to `dependencies`. |

---

## Task 1: Worktree + install dependencies

**Files:**
- Modify: `packages/web/package.json` (add 2 deps)

- [ ] **Step 1: Create the worktree off main**

```bash
cd /d/DAM-Link-Backend
git worktree add .worktrees/login-screen-gsap -b feat/login-screen-gsap main
cd .worktrees/login-screen-gsap
```

Expected: `git worktree list` shows the new worktree; `git status` says `On branch feat/login-screen-gsap`.

- [ ] **Step 2: Add the two new dependencies to `packages/web/package.json`**

Edit `packages/web/package.json` and add to the `dependencies` block (keep alphabetical order — these slot in after `react-dom`):

```jsonc
"dependencies": {
  "@dam-link/contracts": "workspace:^",
  "@gsap/react": "^2.1.2",
  "@tabler/icons-react": "^3.44.0",
  "gsap": "^3.13.0",
  "react": "^19.2.6",
  "react-dom": "^19.2.6"
},
```

- [ ] **Step 3: Install with frozen lockfile (will update the lockfile to include the new deps)**

```bash
pnpm install
```

Expected: completes without errors. The lockfile is updated to include `gsap` and `@gsap/react`.

- [ ] **Step 4: Verify the test infra is healthy**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 12/12 existing `LoginScreen` tests pass. Confirms the baseline before changes.

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "build(web): add gsap + @gsap/react dependencies"
```

---

## Task 2: Create `lib/gsap-setup.ts`

**Files:**
- Create: `packages/web/src/lib/gsap-setup.ts`

- [ ] **Step 1: Create the file**

Create `packages/web/src/lib/gsap-setup.ts`:

```ts
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// Re-export both. As of @gsap/react 2.x, no `gsap.registerPlugin(useGSAP)` call
// is needed — the hook manages its own gsap.Context lifecycle.
// ScrollTrigger, SplitText, etc. are out of scope for this plan.
export { gsap, useGSAP };

// Motion vocabulary — the only place these numbers live.
// (No CSS custom properties for these: motion is JS, not style.)
export const GSAP_DURATIONS = {
  slow: 0.8,     // hero elements (headline)
  medium: 0.5,   // secondary copy, form fields
  fast: 0.35,    // mode-switch sub copy crossfade
  micro: 0.25,   // button/switch fade-in
} as const;

export const GSAP_EASING = {
  enter: 'power3.out',     // mount entrance primary
  enterSoft: 'power2.out', // mount entrance secondary
  inOut: 'power2.inOut',   // mode switch
} as const;
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web exec tsc -b
```

Expected: 0 errors. (The module is unused so far — that's fine; T3 and T4 will import it.)

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/gsap-setup.ts
git commit -m "feat(web): add gsap-setup module (re-exports + motion vocabulary)"
```

---

## Task 3: Create `lib/animations/login-screen.ts` (timeline factories)

**Files:**
- Create: `packages/web/src/lib/animations/login-screen.ts`

- [ ] **Step 1: Create the file**

Create `packages/web/src/lib/animations/login-screen.ts`:

```ts
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
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web exec tsc -b
```

Expected: 0 errors. (The module is unused so far — T4 will import it.)

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/animations/login-screen.ts
git commit -m "feat(web): add login-screen timeline factories (mount + mode switch)"
```

---

## Task 4: Add `data-anim` attributes and refs to `LoginScreen.tsx`

**Files:**
- Modify: `packages/web/src/components/auth/LoginScreen.tsx`

- [ ] **Step 1: Add the imports and refs**

In `packages/web/src/components/auth/LoginScreen.tsx`, replace the existing `import { useState, type FormEvent } from 'react';` line with:

```tsx
import { useRef, useState, type FormEvent } from 'react';
```

(Add `useRef` to the existing import.)

Then, just after the `export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {` opening, add two refs:

```tsx
  const cardRef = useRef<HTMLElement>(null);
  const prevModeRef = useRef<LoginMode>('login');
```

(Leave a blank line between the existing `useState` lines and these two new lines.)

Also add this import near the top of the file (next to the other lib imports):

```tsx
import type { LoginMode } from '../../lib/animations/login-screen.js';
```

(Use `import type` because `verbatimModuleSyntax: true` is enabled per `tsconfig.app.json`.)

- [ ] **Step 2: Add `data-anim` attributes to the JSX**

In the same file, add `data-anim="..."` attributes to the elements that the timelines target. Do not change any other JSX. Find each element and add the attribute:

- The TL corner `<span>`: add `data-anim="corner"` (after `aria-hidden="true"`).
- The BR corner `<span>`: add `data-anim="corner"` (after `aria-hidden="true"`).
- The meta `<p className={styles.meta}>`: add `data-anim="meta"` (after `className={styles.meta}`).
- The headline `<h1 className={styles.headline}>`: add `data-anim="headline"` (after `className={styles.headline}`).
- The sub `<p className={styles.sub}>`: add `data-anim="sub"` (after `className={styles.sub}`).
- The `<hr className={styles.rule} />`: add `data-anim="rule"` (after `className={styles.rule}`).
- The Name field wrapper `<div className={`${styles.field} ${styles.fieldAnimated}`}>`: add `data-anim="name-field"` (after the className). Also remove `${styles.fieldAnimated}` from that className — it's the dead CSS class removed in Task 7.
- The Email field wrapper `<div className={styles.field}>`: add `data-anim="field"`.
- The Password field wrapper `<div className={styles.field}>`: add `data-anim="field"`.
- The footer row `<div className={styles.footerRow}>`: add `data-anim="footer"`.

The diff will look like:

```tsx
<span className={`${styles.corner} ${styles.cornerTL}`} aria-hidden="true" data-anim="corner">
// ...
<p className={styles.meta} data-anim="meta">VOL. 01 / NO. 26 / 2026</p>
// ...
<h1 className={styles.headline} data-anim="headline">An archive, organized.</h1>
// ...
<p className={styles.sub} data-anim="sub">{copy.sub}</p>
// ...
<hr className={styles.rule} data-anim="rule" />
// ...
<div className={styles.field} data-anim="name-field">
// ...
<div className={styles.field} data-anim="field">
// ...
<div className={styles.footerRow} data-anim="footer">
```

Attach the `cardRef` to the root `<article>`:

```tsx
<article ref={cardRef} className={styles.card}>
```

- [ ] **Step 3: Verify the file still compiles and existing tests pass**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web exec tsc -b
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: tsc clean, 12/12 LoginScreen tests pass. (No behavior change yet — the refs and data-anim attrs are inert without the `useGSAP` wiring in T5 and T6.)

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/auth/LoginScreen.tsx
git commit -m "refactor(web): add data-anim attrs + refs to LoginScreen (prep for GSAP)"
```

---

## Task 5: Wire the mount entrance `useGSAP`

**Files:**
- Modify: `packages/web/src/components/auth/LoginScreen.tsx`
- Modify: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Write the failing test for "mount entrance runs on initial render"**

Open `packages/web/tests/LoginScreen.test.tsx`. At the top of the file, add this import (right after the existing `import { ApiError } from '../src/api/client.js';` line):

```tsx
import * as loginScreenAnimations from '../src/lib/animations/login-screen.js';
import { gsap } from 'gsap';
```

Then add a factory mock at the top of the file, right after the existing `vi.mock('../src/api/auth.js', () => ({` block. The new mock targets the timeline factories:

```tsx
vi.mock('../src/lib/animations/login-screen.js', () => ({
  createMountEntrance: vi.fn(),
  createModeSwitchTimeline: vi.fn(),
}));
```

Now add a helper to mock `window.matchMedia` and a new describe block at the bottom of the file:

```tsx
describe('LoginScreen GSAP mount entrance (T5)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockMatchMedia(matches: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  }

  it('runs the mount entrance on initial render when no-preference', async () => {
    mockMatchMedia(true);
    render(<LoginScreen onSuccess={() => {}} />);

    await waitFor(() => {
      expect(loginScreenAnimations.createMountEntrance).toHaveBeenCalledTimes(1);
    });
  });

  it('skips the mount entrance when prefers-reduced-motion is reduce', async () => {
    mockMatchMedia(false);
    render(<LoginScreen onSuccess={() => {}} />);

    // Give React + GSAP a tick to either run or not run the entrance.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(loginScreenAnimations.createMountEntrance).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: The two new T5 tests FAIL with "expected `createMountEntrance` to have been called 1 time, but it was called 0 times" (and the negative case symmetrically). The other 12 tests still pass.

- [ ] **Step 3: Wire the mount entrance `useGSAP` in `LoginScreen.tsx`**

Open `packages/web/src/components/auth/LoginScreen.tsx`. Replace the existing top-of-file `import` block (the line that imports from `../../lib/gsap-setup.js` if any, plus the other imports) to add the setup import. The full import block at the top of the file should now look like this:

```tsx
import { useRef, useState, type FormEvent } from 'react';
import { register as apiRegister, login as apiLogin } from '../../api/auth.js';
import { ApiError } from '../../api/client.js';
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import {
  createMountEntrance,
  createModeSwitchTimeline,
  type LoginMode,
} from '../../lib/animations/login-screen.js';
import styles from './LoginScreen.module.css';
```

(If the `import type { LoginMode }` line from T4 is already there, just merge it into the import above — remove the standalone `import type` line.)

Now, immediately after the two `useRef` lines (cardRef, prevModeRef) added in T4, add the mount entrance `useGSAP`:

```tsx
  // Mount entrance — runs once on mount, gated on prefers-reduced-motion.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (!cardRef.current) return;
        createMountEntrance(cardRef.current).play(0);
      });
      return () => mm.revert();
    },
    { scope: cardRef },
  );
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: All 14 tests pass (12 existing + 2 new T5). The 2 T5 tests now correctly assert that the factory is called under no-preference and NOT called under reduce.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/auth/LoginScreen.tsx packages/web/tests/LoginScreen.test.tsx
git commit -m "feat(web): wire mount-entrance useGSAP in LoginScreen (with T5 tests)"
```

---

## Task 6: Wire the mode-switch `useGSAP`

**Files:**
- Modify: `packages/web/src/components/auth/LoginScreen.tsx`
- Modify: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Write the failing test for "mode switch plays the crossfade"**

Open `packages/web/tests/LoginScreen.test.tsx`. Add a new describe block at the bottom of the file (after the T5 block):

```tsx
describe('LoginScreen GSAP mode switch (T6)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockMatchMedia(matches: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  }

  it('calls createModeSwitchTimeline when the user clicks the mode switch', async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);

    // Wait for the initial mount to finish wiring.
    await waitFor(() => {
      expect(loginScreenAnimations.createMountEntrance).toHaveBeenCalledTimes(1);
    });

    // Click the mode switch (login -> register).
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    await waitFor(() => {
      expect(loginScreenAnimations.createModeSwitchTimeline).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'login',
        'register',
      );
    });
  });

  it('cleans up the GSAP context on unmount (no leftover timelines)', async () => {
    mockMatchMedia(true);
    const { unmount } = render(<LoginScreen onSuccess={() => {}} />);

    await waitFor(() => {
      expect(loginScreenAnimations.createMountEntrance).toHaveBeenCalledTimes(1);
    });

    const timelineCountBeforeUnmount = gsap.globalTimeline.getChildren(true, true, true).length;
    expect(timelineCountBeforeUnmount).toBeGreaterThan(0);

    unmount();

    // useGSAP reverts its context on unmount, killing all tweens created within.
    await waitFor(() => {
      const timelineCountAfterUnmount = gsap.globalTimeline.getChildren(true, true, true).length;
      expect(timelineCountAfterUnmount).toBeLessThan(timelineCountBeforeUnmount);
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: The two new T6 tests FAIL (the first because `createModeSwitchTimeline` is not called; the second because there are no leftover timelines to clean up — both are placeholders until the wiring exists).

- [ ] **Step 3: Wire the mode-switch `useGSAP` in `LoginScreen.tsx`**

Open `packages/web/src/components/auth/LoginScreen.tsx`. Immediately after the mount entrance `useGSAP` added in T5, add the mode-switch `useGSAP`:

```tsx
  // Mode switch — replays when `mode` changes.
  useGSAP(
    () => {
      if (!cardRef.current) return;
      // useGSAP's dependencies array doesn't expose the previous value, so we
      // track it via prevModeRef. The first invocation has prevModeRef.current
      // === mode (both 'login'), so createModeSwitchTimeline returns an empty
      // timeline — no double-animation with the mount entrance.
      createModeSwitchTimeline(cardRef.current, prevModeRef.current, mode).play(0);
      prevModeRef.current = mode;
    },
    { scope: cardRef, dependencies: [mode] },
  );
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: All 16 tests pass (12 existing + 2 T5 + 2 T6). The 2 T6 tests now correctly assert that `createModeSwitchTimeline` is called on mode switch and that the GSAP context is cleaned up on unmount.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/auth/LoginScreen.tsx packages/web/tests/LoginScreen.test.tsx
git commit -m "feat(web): wire mode-switch useGSAP in LoginScreen (with T6 tests)"
```

---

## Task 7: Clean up `LoginScreen.module.css`

**Files:**
- Modify: `packages/web/src/components/auth/LoginScreen.module.css`

- [ ] **Step 1: Remove the now-redundant `.fieldAnimated` class, `@keyframes fieldIn`, and the local `prefers-reduced-motion: reduce` override**

Open `packages/web/src/components/auth/LoginScreen.module.css`. Find and delete the following three blocks (the exact lines may shift slightly if the file has been edited; the content to delete is the `.fieldAnimated` class, the `@keyframes fieldIn` block, and the `@media (prefers-reduced-motion: reduce)` block that targets `.fieldAnimated`):

Delete these lines (the class and its keyframe):

```css
.fieldAnimated {
  /* Height + opacity transition for the Name field insertion. */
  animation: fieldIn 180ms var(--easing-standard) both;
}

@keyframes fieldIn {
  from { opacity: 0; transform: translateY(-4px); max-height: 0; }
  to   { opacity: 1; transform: translateY(0);   max-height: 200px; }
}
```

And delete the local reduced-motion override (the entire `@media (prefers-reduced-motion: reduce)` block that contains `.fieldAnimated { animation: none; }` — this block ONLY contains that one rule, so delete the whole block):

```css
@media (prefers-reduced-motion: reduce) {
  .fieldAnimated { animation: none; }
}
```

(The global `prefers-reduced-motion` rule in `src/styles/global.css` is preserved — it zeroes out all `animation-duration` and `transition-duration` values. It stays.)

Do NOT touch any other rule. The card padding, the responsive media queries, the focus state, the spinner keyframes, and the rest of the file are unchanged.

- [ ] **Step 2: Verify the file still compiles and all tests pass**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web exec tsc -b
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: tsc clean, 16/16 LoginScreen tests pass. The Name field no longer animates via CSS (GSAP drives it now).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/auth/LoginScreen.module.css
git commit -m "refactor(web): drop redundant .fieldAnimated CSS (now driven by GSAP)"
```

---

## Task 8: Type-check + lint pass

**Files:** none new.

- [ ] **Step 1: Type-check the package**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web exec tsc -b
```

Expected: 0 errors. If any type complaint appears (e.g., unused `prevModeRef` if T6 was skipped, or a missing import), fix it.

- [ ] **Step 2: Lint the package**

```bash
pnpm -F @dam-link/web lint
```

Expected: 0 NEW errors. The 7 pre-existing errors in unrelated files (`App.tsx`, `ConfirmDialog.tsx`, `ToastProvider.tsx`, `DetailPanel.tsx`, `useKeyboardShortcuts.ts`, `persistence.ts`, `store.tsx`) are out of scope. If lint complains about files in this PR, fix them.

- [ ] **Step 3: Run the full web test suite to make sure nothing else regressed**

```bash
pnpm -F @dam-link/web test
```

Expected: 23 suites, 192+ tests pass (the baseline was 188 + 4 new = 192).

- [ ] **Step 4: Commit any fixes (if any)**

```bash
git add -u
git diff --cached --quiet || git commit -m "chore(web): address lint/type findings in login screen GSAP work"
```

If no changes, skip the commit step.

---

## Task 9: Visual verification — desktop (login + register + mid-animation)

**Files:**
- Create: `docs/superpowers/plans/screenshots/T9/verify_desktop.py`
- Create: `docs/superpowers/plans/screenshots/T9/*.png` (3 screenshots)

- [ ] **Step 1: Locate the `webapp-testing` helper script and write a Playwright verification script**

From the worktree root:

```bash
ls "C:/Users/Administrator/.claude/plugins/cache/anthropic-agent-skills/document-skills/f458cee31a75/skills/webapp-testing/scripts/"
```

Create `docs/superpowers/plans/screenshots/T9/verify_desktop.py` with the following content (adjust the `with_server.py` path if different):

```python
"""Visual verification for the GSAP-animated LoginScreen at desktop viewport."""
from pathlib import Path
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = Path(__file__).parent
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": 1280, "height": 900},
                reduced_motion="no-preference",
            )
            page = context.new_page()
            page.goto("http://localhost:5173", wait_until="networkidle")

            # Wait long enough for the mount entrance to finish (~1.65s + buffer).
            page.wait_for_timeout(2000)
            page.screenshot(
                path=str(SCREENSHOT_DIR / "t9-desktop-login.png"),
                full_page=True,
            )

            # Click the mode switch to enter register mode.
            page.get_by_role("button", name="Register").click()
            # Wait for the mode-switch timeline to complete (~0.45s + buffer).
            page.wait_for_timeout(800)
            page.screenshot(
                path=str(SCREENSHOT_DIR / "t9-desktop-register.png"),
                full_page=True,
            )

            # Reload to capture a mid-animation shot of the mount entrance.
            page.goto("http://localhost:5173", wait_until="domcontentloaded")
            # Wait for the headline to start fading in (around t=300ms) but
            # before it finishes (t=1100ms). 600ms is the sweet spot.
            page.wait_for_timeout(600)
            page.screenshot(
                path=str(SCREENSHOT_DIR / "t9-desktop-mid-animation.png"),
                full_page=True,
            )
        finally:
            browser.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the dev server and the verification script in one command**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
python "C:/Users/Administrator/.claude/plugins/cache/anthropic-agent-skills/document-skills/f458cee31a75/skills/webapp-testing/scripts/with_server.py" \
  --server "pnpm -F @dam-link/web dev" --port 5173 \
  -- python docs/superpowers/plans/screenshots/T9/verify_desktop.py
```

Expected: server starts on port 5173, the script runs, 3 PNG screenshots are saved to `docs/superpowers/plans/screenshots/T9/`. The dev server is killed automatically when the script exits.

- [ ] **Step 3: Read each screenshot with the Read tool and verify**

For each of the 3 PNGs (`t9-desktop-login.png`, `t9-desktop-register.png`, `t9-desktop-mid-animation.png`):

- Read the image. Confirm:
  - **login.png**: cover is fully assembled (headline visible, sub copy visible, form fields visible, "Sign in →" button visible, page footer visible). No flash of unstyled content. Looks identical to the Plan 10 login screenshot.
  - **register.png**: NAME field is visible at the top of the form, sub copy is the register variant, button label is `Create account →`, switch reads `Have an account? Sign in`.
  - **mid-animation.png**: this is the interesting one. The corner marks, meta, and headline should be at varying opacities (mid-fade). The form fields should still be invisible or just starting to appear. The page should look "in motion" — not fully assembled yet.

If any screenshot looks wrong, fix the animation in `LoginScreen.tsx` or the factory, re-run the script, and re-verify. Iterate until all 3 look right.

- [ ] **Step 4: Commit the screenshots and the verification script**

The plans/screenshots dir is in `.gitignore` (added in Plan 10), so use `git add -f`:

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
git add -f docs/superpowers/plans/screenshots/T9/
git commit -m "docs(web): add T9 desktop visual verification screenshots + script"
```

---

## Task 10: Visual verification — reduced motion + mobile unchanged

**Files:**
- Create: `docs/superpowers/plans/screenshots/T10/verify_responsive.py`
- Create: `docs/superpowers/plans/screenshots/T10/*.png` (3 screenshots)

- [ ] **Step 1: Write a Playwright verification script**

Create `docs/superpowers/plans/screenshots/T10/verify_responsive.py`:

```python
"""Visual verification for reduced-motion + mobile regression on the GSAP-animated LoginScreen."""
from pathlib import Path
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = Path(__file__).parent
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            # 1. Reduced motion at desktop — should look like the static final state, immediately.
            ctx_reduced = browser.new_context(
                viewport={"width": 1280, "height": 900},
                reduced_motion="reduce",
            )
            page_reduced = ctx_reduced.new_page()
            page_reduced.goto("http://localhost:5173", wait_until="domcontentloaded")
            # Even at 0ms wait, the page should be at its final state (no entrance).
            page_reduced.screenshot(
                path=str(SCREENSHOT_DIR / "t10-reduced-motion.png"),
                full_page=True,
            )
            ctx_reduced.close()

            # 2. Mobile (390x844) — regression check: animations didn't break the existing responsive layout.
            ctx_mobile = browser.new_context(
                viewport={"width": 390, "height": 844},
                reduced_motion="no-preference",
            )
            page_mobile = ctx_mobile.new_page()
            page_mobile.goto("http://localhost:5173", wait_until="networkidle")
            page_mobile.wait_for_timeout(2000)  # wait for mount entrance
            page_mobile.screenshot(
                path=str(SCREENSHOT_DIR / "t10-phone-login.png"),
                full_page=True,
            )
            ctx_mobile.close()

            # 3. Tablet (768x1024) — regression check.
            ctx_tablet = browser.new_context(
                viewport={"width": 768, "height": 1024},
                reduced_motion="no-preference",
            )
            page_tablet = ctx_tablet.new_page()
            page_tablet.goto("http://localhost:5173", wait_until="networkidle")
            page_tablet.wait_for_timeout(2000)
            page_tablet.screenshot(
                path=str(SCREENSHOT_DIR / "t10-tablet-login.png"),
                full_page=True,
            )
            ctx_tablet.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the verification script**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
python "C:/Users/Administrator/.claude/plugins/cache/anthropic-agent-skills/document-skills/f458cee31a75/skills/webapp-testing/scripts/with_server.py" \
  --server "pnpm -F @dam-link/web dev" --port 5173 \
  -- python docs/superpowers/plans/screenshots/T10/verify_responsive.py
```

Expected: 3 PNG screenshots saved to `docs/superpowers/plans/screenshots/T10/`.

- [ ] **Step 3: Read each screenshot and verify**

For each PNG:

- Read the image.
  - **t10-reduced-motion.png**: cover is fully assembled and at its final state. There should be NO mid-animation look (no half-faded elements). Identical to the static login screenshot from Plan 10.
  - **t10-phone-login.png**: matches Plan 11's phone screenshot — no border/radius, padding reduced, footer row stacks, corner marks hidden. The GSAP work did not break the responsive behavior.
  - **t10-tablet-login.png**: matches Plan 11's tablet screenshot — card 720px, padding 56px, headline 48px, corner marks visible.

If the phone or tablet look broken, fix the CSS or the GSAP wiring in `LoginScreen.tsx`. Re-run and re-verify.

- [ ] **Step 4: Commit the screenshots and the verification script**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
git add -f docs/superpowers/plans/screenshots/T10/
git commit -m "docs(web): add T10 reduced-motion + mobile/tablet regression screenshots"
```

---

## Task 11: Final acceptance — full test + tag the merge

**Files:** none new.

- [ ] **Step 1: Run the full final check suite**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
pnpm -F @dam-link/web exec tsc -b
pnpm -F @dam-link/web lint
pnpm -F @dam-link/web test
```

Expected:
- tsc: 0 errors.
- lint: 0 NEW errors. (Pre-existing 7 errors in unrelated files stay; this PR does not introduce any.)
- test: 23+ suites, 192+ tests, all green.

- [ ] **Step 2: Verify the spec's acceptance criteria one by one**

Open `docs/superpowers/specs/2026-06-06-login-screen-gsap-animations-design.md` §9 and check each item:

- [ ] `pnpm -F @dam-link/web install` succeeded (T1 step 3).
- [ ] tsc clean (T8 + T11).
- [ ] lint reports zero NEW errors (T8 + T11).
- [ ] All 12 existing LoginScreen tests pass (T8).
- [ ] All 4 new tests pass (T5 + T6).
- [ ] Full test suite green (T8 + T11).
- [ ] Mount entrance visibly staged in browser (T9 screenshots).
- [ ] `prefers-reduced-motion: reduce` shows final state immediately (T10 screenshot).
- [ ] Mode switch animates smoothly (T9 register screenshot).
- [ ] Files changed match scope: `LoginScreen.tsx`, `LoginScreen.module.css`, `LoginScreen.test.tsx`, plus the two new `src/lib/` files, plus `package.json` + `pnpm-lock.yaml`, plus the spec doc on main.

Run `git diff --name-only main..feat/login-screen-gsap` to confirm.

- [ ] **Step 3: Show the commit log on the branch**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-screen-gsap
git log --oneline main..feat/login-screen-gsap
```

Expected: 8 commits on the branch (T1 install, T2 setup, T3 factories, T4 data-anim, T5 mount entrance, T6 mode switch, T7 CSS cleanup, T8 chore if any, T9 docs, T10 docs — that's 8-10 commits depending on whether T8 produced a chore commit and whether T9/T10 each produced one).

- [ ] **Step 4: Done. Report the branch state to the user.**

The next step (merge to main + tag) will happen via the `finishing-a-development-branch` skill after the user reviews the visual verification screenshots.

---

## Self-review

### Spec coverage (spec §1-9 → tasks)

| Spec section | Covered by |
|---|---|
| §1 Problem | — (background only) |
| §2 Goal | T5 (mount entrance), T6 (mode switch) |
| §3 Design decisions | All four (page, vibe, scope, architecture) flow into T2 + T3 |
| §4.1 New dependency | T1 (install) |
| §4.2 gsap-setup.ts | T2 (verbatim) |
| §4.3 animations/login-screen.ts | T3 (verbatim, with the `from === to` short-circuit as a plan addition per implementation analysis) |
| §4.4 LoginScreen.tsx changes | T4 (data-anim + refs) + T5 (mount entrance) + T6 (mode switch) |
| §4.5 CSS cleanup | T7 (verbatim) |
| §4.6 Unchanged | (no task needed; just don't touch) |
| §5 Timeline content | T3 (factories) + T9 (visual verification) |
| §6 Reduced motion & a11y | T5 (matchMedia gate) + T6 test 2 (assertion) + T10 (visual) |
| §7 Testing | T5 (2 tests) + T6 (2 tests) |
| §8 Out of scope | (no tasks; explicit) |
| §9 Acceptance criteria | T11 (final check) |

### Placeholder scan

No `TBD`, `TODO`, "appropriate", "fill in", or "similar to" patterns. All step contents are concrete and runnable.

### Type / name consistency

- `LoginMode` is defined in T3 (file `animations/login-screen.ts`) and imported in T4 (`import type { LoginMode }`) and T5/T6 (merged into the main import block).
- `cardRef` is declared in T4, attached to the `<article>` in T4, read in T5 + T6.
- `prevModeRef` is declared in T4, read + written in T6.
- `createMountEntrance` and `createModeSwitchTimeline` are defined in T3, mocked at the top of the test file in T5, and called in T5 + T6.
- The `data-anim` attribute names in T4 match the selectors in T3 exactly (`corner`, `meta`, `headline`, `sub`, `rule`, `field`, `name-field`, `footer`).
- `GSAP_DURATIONS` and `GSAP_EASING` are defined in T2 and used in T3.
- `gsap.matchMedia`, `mm.add`, `mm.revert` are used in T5 exactly as in the spec.

### Known deviations from the spec

1. **The `from === to` short-circuit** in `createModeSwitchTimeline` (T3 step 1) is a plan addition. The spec's pseudocode didn't include it, but without it the initial mount would run a no-op "login→login" mode-switch timeline that briefly fades in the sub copy, conflicting with the mount-entrance's sub-copy animation. The short-circuit is a 1-line guard with the same intent.
2. **Factory unit tests are skipped.** The spec's test plan (spec §7) lists 4 tests, all in `LoginScreen.test.tsx`. There are no factory-level unit tests. T3 has no test; the factories are exercised via T5 + T6 integration tests with the factories mocked.

These deviations are noted for the implementer / spec reviewer. If either is unacceptable, the plan can be revised before execution.

### File-change scope check

The plan modifies exactly the files listed in the spec's "Architecture & file changes" (§4) plus `package.json` and `pnpm-lock.yaml` (T1) and the new screenshot directories (T9 + T10). No other source files are touched.
