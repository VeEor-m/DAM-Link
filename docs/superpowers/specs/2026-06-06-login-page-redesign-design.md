# Login Page Redesign — Design Spec

> **Status:** Approved by user 2026-06-06 via visual companion.
> **Scope:** `packages/web/src/components/auth/LoginScreen.{tsx,module.css}` only. No backend or API changes. No other components touched.

## 1. Problem

The current `LoginScreen` is a 60-line component using bare HTML elements (no CSS module, no design-token consumption). It renders unstyled on top of `--color-background-secondary`, so the first thing every user sees — the unauthenticated entry point — looks like an unstyled form demo. Given the app's strong design system (`tokens.css`, every other component has a `.module.css`), this is a glaring inconsistency and a poor first impression.

The component is also functionally thin: a single mode-switch button that swaps "Sign in" / "Register" without a smooth transition, a `...` loading indicator, and an `ApiError.message` rendered in a `<div class="error">` that has no styling — all contributing to the "unfinished" feel.

## 2. Goal

Make the login page a designed entry point that:

- Sets the brand tone ("editorial, archival, calm") before the user reaches the asset browser.
- Feels native to the existing design system: consumes CSS tokens, follows the CSS-Modules + a11y conventions of every other component.
- Improves the perceived quality of the form interactions (focus, loading, error, mode switch) without changing the API contract.
- Works on every viewport (phone ≤640, tablet 641–1023, desktop 1024–1280, wide >1280) without a separate "mobile" design.

## 3. Design Decisions (confirmed with user)

| Dimension | Choice | Rationale |
|---|---|---|
| Personality | Editorial / creative studio | User-selected direction; differentiates from typical SaaS logins. |
| Layout | Magazine cover — type-led, centered, max 880px content column | User selected option B in the layout round. Editorial, works on every viewport. |
| Typography | Georgia (display) + system sans (body) + system mono (labels & meta) | User selected. Zero new dependencies; matches existing dependency-light posture of `packages/web`. |
| Imagery | None — pure type + whitespace | User selected. No image sourcing, no asset API, no responsive re-flow. |
| Cover copy | `VOL. 01 / NO. 26 / 2026` (meta) + `An archive, organized.` (display) + `Sign in to your library. A calm place to find, file, and finish with the assets you make.` (sub) | User selected option C. |
| Form layout | Stacked, label-above (mono uppercase), bottom-border-only inputs | User selected option B. Magazine-column feel, good on small screens. |

## 4. Final Composition

A single full-viewport page, light background (`--color-background-secondary: #f6f8fa`), centered content column capped at **880px**, with a thin `1px` border + `--border-radius-lg` wrapping card (subtle — the card holds everything except the page-footer band).

```
┌──────────────────────────────────────────────────────────────────┐
│  DAM-Link · est. 2026                                P. 01 / 01  │  ← corner marks (mono, tertiary)
│                                                                  │
│  VOL. 01 / NO. 26 / 2026                                         │  ← meta (mono, tertiary)
│                                                                  │
│  An archive, organized.                                          │  ← display (Georgia, 56px desktop, 40px phone)
│                                                                  │
│  Sign in to your library. A calm place to find, file, and        │  ← sub (sans, 14px, secondary)
│  finish with the assets you make.                                │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │  ← hairline rule
│                                                                  │
│  EMAIL                                                          │  ← label (mono, 10px, uppercase, tertiary)
│  you@studio.com____________________________________________     │  ← input (transparent, 1px bottom border)
│                                                                  │
│  PASSWORD                                                       │
│  •••••••••••••••••••••••••••••••••____________________________   │
│                                                                  │
│  (error)                                                        │  ← only when present
│                                                                  │
│  No account? Register                          [ Sign in → ]    │  ← switch (sans, tertiary, underline) + button
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│            DAM-LINK · A DIGITAL ASSET LIBRARY                    │  ← page footer (mono, tertiary, hairline rule above)
└──────────────────────────────────────────────────────────────────┘
```

### 4.1 Login mode copy

| Slot | Login | Register |
|---|---|---|
| Sub | `Sign in to your library. A calm place to find, file, and finish with the assets you make.` | `Start your collection. We'll set up a workspace in under a minute.` |
| Button | `Sign in →` | `Create account →` |
| Switch | `No account? Register` | `Have an account? Sign in` |
| Fields | Email, Password | Name, Email, Password |

In register mode the `Name` field renders first, **animated in** (height + opacity, 180ms, `--easing-standard`, respect `prefers-reduced-motion`). Switching back to login reverses the animation. The `displayName` field is required and validated client-side as non-empty trimmed string.

### 4.2 Type scale

| Token | Size | Family | Weight | Use |
|---|---|---|---|---|
| Cover display (desktop ≥1024) | 56px / 1.04 | Georgia (serif fallback chain) | 400 | `An archive, organized.` |
| Cover display (phone ≤640) | 40px / 1.05 | Georgia | 400 | same |
| Sub | 14px / 1.55 | system sans | 400 | sub paragraph |
| Meta | 11px / 1.5 | system mono | 400 | `VOL. 01 / NO. 26 / 2026`, corner marks, page footer |
| Field label | 10px / 1.5 | system mono | 400 | `EMAIL`, `PASSWORD`, `NAME` |
| Input | 15px / 1.5 | system sans | 400 | placeholder + value |
| Switch | 12px / 1.5 | system sans | 400 | `No account? Register` |
| Button | 13px / 1 | system sans | 500 | `Sign in →` |
| Error | 12px / 1.5 | system sans | 400 | inline error message |
| Corner marks | 10px / 1 | system mono | 400 | `DAM-Link · est. 2026`, `P. 01 / 01` |

Serif fallback chain: `Georgia, "Times New Roman", "Songti SC", "STSong", serif` (Chinese-friendly: 思源宋体 / 华文宋体 fallback).

### 4.3 Color & motion

- Background: `--color-background-secondary` (`#f6f8fa`).
- Card: `--color-background-primary` (`#ffffff`).
- Hairline rules: `--color-border-tertiary` (`#e6e8eb`).
- Input bottom border: `--color-border-secondary` (`#d6dadf`) resting, `--color-text-primary` (`#1c2733`) on focus.
- Type primary: `--color-text-primary`. Secondary: `--color-text-secondary`. Tertiary / meta / labels: `--color-text-tertiary`.
- Button: background `--color-text-primary`, text `#fff`. Hover: `--color-text-secondary` background. Disabled: `opacity: 0.5`.
- Error: `--color-text-danger` (`#d6336c`).
- **No accent blue.** The whole page is monochrome; the only color outside black/white/grey is the danger red on error. (Keeps the editorial tone; existing blue `--color-text-info` is reserved for in-app interactive moments.)
- Focus ring: existing global `:focus-visible` rule (`var(--focus-ring)`). Inputs also thicken their bottom border on focus, which is the magazine idiom (no box-shadow on the input itself).
- Motion: all transitions use `--motion-fast` (120ms) or `--motion-normal` (180ms) with `--easing-standard` (`cubic-bezier(0.2, 0, 0, 1)`). Name field insertion animates height + opacity. `prefers-reduced-motion` global rule (already in `global.css`) zeroes durations.

### 4.4 Component anatomy

```tsx
<main className={styles.page}>
  <article className={styles.card}>
    <span className={styles.cornerTL}>DAM-Link · est. 2026</span>
    <span className={styles.cornerBR}>P. 01 / 01</span>

    <header className={styles.cover}>
      <p className={styles.meta}>VOL. 01 / NO. 26 / 2026</p>
      <h1 className={styles.headline}>An archive, organized.</h1>
      <p className={styles.sub}>{modeSub}</p>
    </header>

    <hr className={styles.rule} />

    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {mode === 'register' && (
        <div className={styles.field}>
          <label htmlFor="name" className={styles.label}>Name</label>
          <input id="name" className={styles.input} ... />
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>Email</label>
        <input id="email" className={styles.input} type="email" ... />
      </div>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>Password</label>
        <input id="password" className={styles.input} type="password" minLength={8} ... />
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <div className={styles.footerRow}>
        <span className={styles.switch}>
          {mode === 'login' ? 'No account? ' : 'Have an account? '}
          <button type="button" className={styles.switchButton} onClick={toggleMode}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </span>
        <button type="submit" className={styles.button} disabled={busy}>
          {busy ? <Spinner /> : buttonLabel}
        </button>
      </div>
    </form>
  </article>

  <footer className={styles.pageFooter}>DAM-LINK · A DIGITAL ASSET LIBRARY</footer>
</main>
```

A small inline `Spinner` SVG (a `1em` square with a rotating circle, defined in the same module CSS via `@keyframes spin`) renders inside the submit button while `busy`. White stroke, no external dependency. The corner marks `<span>` elements are decorative and carry `aria-hidden="true"`.

## 5. Architecture & file changes

### 5.1 New file: `packages/web/src/components/auth/LoginScreen.module.css`

- All classes are CSS-Module-scoped; no global selectors.
- Consumes only existing tokens from `src/styles/tokens.css`.
- Mobile-first media query at the 640px breakpoint to shrink the cover display from 56→40px and the card padding from 72px 88px → 40px 28px.
- One new `prefers-reduced-motion` override inside the file (in addition to the global) for the Name-field insertion animation only.

### 5.2 Modified: `packages/web/src/components/auth/LoginScreen.tsx`

- Add `id` attributes on inputs (`email`, `password`, `name`) for `<label htmlFor>` binding.
- Replace the bare `<form>` mode-switch `<button>` (the one that flips login↔register) with a typed `<button type="button">` so it can't accidentally submit the form. **Decision recorded in §10 a11y: not an `<a>` without `href`** (anti-pattern). The switch uses inline style (no underline) to read as an inline control, distinct from a primary action.
- Replace `busy ? '...'` with a `<Spinner />` component.
- Move copy constants into a top-of-file `const COPY` object so the design spec is the single source of truth for visible strings. The component reads from `COPY.login` / `COPY.register`.
- Add `aria-live="polite"` to the error region. The `<p role="alert">` also reads correctly to AT.
- `noValidate` on the form — we do our own validation (see §6).

### 5.3 New file: `packages/web/src/components/auth/LoginScreen.test.tsx`

- Vitest + Testing Library. Mounts the component.
- Asserts: (1) login mode shows email + password but not name; (2) clicking "Register" reveals name, copy updates, focus moves to the new field; (3) submitting empty email shows an error and does not call the API; (4) submitting valid credentials calls `apiLogin` exactly once and triggers `onSuccess`; (5) `ApiError` is rendered verbatim; (6) clicking the switch while `busy` does not unmount / re-trigger.

### 5.4 Unchanged

- `src/api/auth.ts`, `src/api/client.ts`, `App.tsx` (consumer): the public `LoginScreen({ onSuccess }: Props)` signature is preserved.
- `src/styles/tokens.css`: no new tokens. (The new `--font-serif` could be added to tokens, but per user direction we want zero new dependencies and zero new tokens; the Georgia stack is inlined in the module CSS where it's used. If a second component ever needs it, we promote then.)

## 6. Validation & error handling

| Case | Behavior |
|---|---|
| Empty email | Block submit; show `"Email is required."` inline (red). |
| Email format invalid | Block submit; show `"That doesn't look like an email."` inline. |
| Empty password | Block submit; show `"Password is required."` inline. |
| Password < 8 chars (register only) | Block submit; show `"Use at least 8 characters."` inline. |
| Empty name (register only) | Block submit; show `"Name is required."` inline. |
| `ApiError` from server | Show `err.message` verbatim, in red, replacing any client-side error. |
| Network error (non-`ApiError`) | Show `"Something went wrong. Check your connection and try again."` |
| Submit succeeds | Call `onSuccess()`; do not clear the form (component will unmount via parent state flip in `App.tsx`). |
| Rapid double-submit | `busy` flag disables the button; the `<form onSubmit>` also gets `pointer-events: none` on the button via `[disabled]` so the second click is a no-op even before React state updates. |

Errors replace previous error text on each submit attempt (not append). The error region is `aria-live="polite"` so screen readers announce it; the `<p role="alert">` is a belt-and-suspenders choice that works in browsers that don't auto-announce polite regions.

## 7. Responsive behavior

| Viewport | Card padding | Headline | Card max-width | Meta / corner marks |
|---|---|---|---|---|
| Phone ≤640 | 40px 28px | 40px | 100% (no margin) | Hidden on smallest (≤480); show above 480 |
| Tablet 641–1023 | 56px 56px | 48px | 720px | Shown |
| Desktop 1024–1280 | 72px 72px | 56px | 880px | Shown |
| Wide >1280 | 72px 88px | 56px | 880px (centered) | Shown |

On phone the card border + radius disappears (becomes a flat surface against the page background) to maximize width.

## 8. Out of scope

- Forgot-password flow (no backend route exists; explicitly out).
- Email verification banner (no backend route exists; explicitly out).
- "Continue with Google / SSO" buttons (no backend OIDC; explicitly out).
- Adding a new `--font-serif` token to `tokens.css` (defer until a second consumer needs it).
- Animating the entire form in on mount (the `prefers-reduced-motion` audience is sizable and a fade-in is decoration, not signal). Only the Name-field insertion gets an animation, because it conveys "I just appeared" affordance.
- Dark mode (the rest of the app is not dark-mode-ready; adding it just here is inconsistent).

## 9. Testing

`packages/web/src/components/auth/LoginScreen.test.tsx`:

1. **Renders login copy by default** — `Sign in` button, no name field, login sub copy present.
2. **Switches to register on click** — name field appears, button label changes to `Create account →`, sub copy changes.
3. **Animation respects reduced motion** — with `prefers-reduced-motion: reduce`, the name field appears without height animation (CSS test, not a runtime test — but we verify the className includes a `data-animate` attribute that the CSS uses to gate the transition).
4. **Empty submit shows error, no API call** — assert `apiLogin`/`apiRegister` not called.
5. **Invalid email blocks submit** — `you@` shows error, no API call.
6. **Valid login calls apiLogin once and onSuccess** — mock resolves, assert call args `{ email, password }` and onSuccess fired.
7. **Register includes displayName** — register mode, valid submit, assert call args include `displayName`.
8. **ApiError message renders** — mock rejects with `new ApiError(401, 'BAD_CREDENTIALS', 'Invalid email or password')`, assert text appears.
9. **Network error fallback** — mock throws `new Error('boom')`, assert fallback message appears.
10. **Switch is disabled when busy** — set `busy=true` via slow promise, click switch, assert mode does not change.
11. **Button shows Spinner while busy** — slow promise, assert `.spinner` element exists inside the button.
12. **Error region is announced** — error `<p>` has `role="alert"`.

Test setup: `tests/setup.ts` already provides `cleanup()` and clears `localStorage` after each test. `vi.mock('../../api/auth.js')` mocks the API.

## 10. A11y checklist

- [x] Every `<input>` has an associated `<label htmlFor>`.
- [x] Form is keyboard-submittable via Enter in any field.
- [x] Visible focus indicator on every interactive element (existing global `:focus-visible` rule + input's own bottom-border thickening).
- [x] Mode-switch control is a typed `<button type="button">` (not an `<a>` without `href` — anti-pattern). Renders inline, underline-on-hover, distinct from the primary submit button.
- [x] Error region: `role="alert"` + `aria-live="polite"`.
- [x] Button has visible disabled state (`opacity` + `cursor: not-allowed`).
- [x] Page has exactly one `<h1>` (the cover headline).
- [x] Card uses `<main>` for the page landmark; the existing `App.tsx` already provides a top-level wrapper, so this becomes a sibling, not a duplicate.
- [x] Decorative corner marks carry `aria-hidden="true"`.
- [x] `prefers-reduced-motion` honored (global rule + local rule on the name-field animation).
- [x] Color contrast: all text against the white card or grey background passes WCAG AA (≥4.5:1 for body, ≥3:1 for large). Tertiary `#8896a6` on white = 3.45:1, borderline — used only for non-essential meta and labels, with the actual content in primary text.
- [x] Touch target ≥44px on the button and the switch (`min-height: 40px` + padding adjustments, plus the global `--touch-target-min: 44px` is the floor).

## 11. Rollout

- Single worktree (per project convention `.worktrees/<branch>/`).
- One PR: `feat/login-page-redesign`.
- All 12 tests in §9 must pass.
- The existing `LoginScreen` consumer in `App.tsx:360` is unchanged — signature is preserved.
- Visual regression: take a screenshot before / after; attach to PR description.
- No backend, no migrations, no new env vars.

## 12. Open questions for the implementer

- The `<button type="button">` mode switch: animate the label swap with `key`-based remount + `view-transition-name` (Chrome-only)? **No** — defer. Plain text swap.
- Should the cover headline be wrapped in `<h1>` or `<h1 class="sr-only">Sign in</h1>` + the visible text in a `<p>`? **Keep as `<h1>`** — it's the only heading on the page, the wording is a feature, not a trick.

## 13. Acceptance criteria

The change is done when:

1. `LoginScreen.tsx` and `LoginScreen.module.css` are the only files changed in this PR (besides the new test file).
2. All 12 tests in §9 pass.
3. `pnpm -F web lint` and `pnpm -F web test` both pass.
4. The login page renders as in §4 on every viewport in §7.
5. `prefers-reduced-motion: reduce` removes the name-field animation.
6. A screen reader announces the error and the mode switch correctly.
