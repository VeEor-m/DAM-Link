# Login Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unstyled `LoginScreen` component with a designed editorial / magazine-cover login page (Georgia display type, stacked bottom-border form, monochrome palette) while preserving its `{ onSuccess }` public API. No backend, no API, no other components change.

**Architecture:** One CSS Module file (`LoginScreen.module.css`) holds the new visual design, consuming only existing tokens from `packages/web/src/styles/tokens.css` (no new tokens, no new dependencies). The existing `LoginScreen.tsx` is rewritten to use the new classes, add client-side validation, surface `ApiError` / network errors, and show an inline Spinner during the busy state. A new Vitest + React Testing Library test file (`tests/LoginScreen.test.tsx`) covers 12 behaviors listed in the spec. The component is mounted full-screen by `App.tsx:360` and renders only when the user is unauthenticated — no consumer changes.

**Tech Stack:** React 19, TypeScript 5.6 strict, CSS Modules (Vite-native), `tokens.css` CSS variables, Vitest 4 + React Testing Library 16 + userEvent 14 + jest-dom 6 (all already in `packages/web/package.json`).

**Spec:** `docs/superpowers/specs/2026-06-06-login-page-redesign-design.md` (commit `79ffb76`).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/web/src/components/auth/LoginScreen.module.css` | **Create** | All visual design: page surface, card, cover type, form fields, button, switch, error, Spinner, corner marks, page footer, 4-viewport media queries, `prefers-reduced-motion` overrides. |
| `packages/web/src/components/auth/LoginScreen.tsx` | **Modify** | Rewritten to use the new CSS module, `<button type="button">` mode switch, client-side validation, error rendering, inline Spinner, copy constants. Public signature unchanged. |
| `packages/web/tests/LoginScreen.test.tsx` | **Create** | 12 tests covering default render, mode switch, validation (5 cases), API call wiring (login + register), error rendering (ApiError + network), loading (Spinner + disabled switch), `role="alert"`. |
| `packages/web/src/api/auth.ts` | Unchanged | The two functions we mock, not modify. |
| `packages/web/src/api/client.ts` | Unchanged | `ApiError` source. |
| `packages/web/src/App.tsx` | Unchanged | Consumer — signature preserved. |
| `packages/web/src/styles/tokens.css` | Unchanged | No new tokens. |

---

## Task 1: Worktree setup

**Files:** none yet.

- [ ] **Step 1: Create the worktree off `main`**

```bash
cd /d/DAM-Link-Backend
git worktree add .worktrees/login-page-redesign -b feat/login-page-redesign main
cd .worktrees/login-page-redesign
```

Expected: `git worktree list` shows the new worktree; `git status` says `On branch feat/login-page-redesign`.

- [ ] **Step 2: Install dependencies (frozen lockfile)**

```bash
pnpm install --frozen-lockfile
```

Expected: completes without errors. (Memory gotcha: re-install is required after switching branches because `node_modules/` is not committed.)

- [ ] **Step 3: Verify the test runner works on this branch**

```bash
pnpm -F @dam-link/web test -- tests/Modal.test.tsx
```

Expected: `Modal FOCUSABLE selector (N1)` and `Modal focus restore (N2)` test groups pass, ~7 tests. Confirms the test infra is healthy.

---

## Task 2: Create the empty CSS module

**Files:**
- Create: `packages/web/src/components/auth/LoginScreen.module.css`

- [ ] **Step 1: Create the file with all class skeletons**

This is a pure stylesheet with no test. All class names match the spec's §4.4 anatomy. The file is fully written here so the engineer does not have to compose it.

Create `packages/web/src/components/auth/LoginScreen.module.css`:

```css
/* Design tokens are inherited from src/styles/tokens.css — no overrides here. */

.page {
  min-height: 100vh;
  background: var(--color-background-secondary);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 24px 16px;
}

.card {
  position: relative;
  flex: 1 1 auto;
  margin: 0 auto;
  width: 100%;
  max-width: 880px;
  background: var(--color-background-primary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-lg);
  padding: 72px 88px 56px;
  display: flex;
  flex-direction: column;
  gap: 56px;
  justify-content: space-between;
}

.corner {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.cornerTL { top: 24px; left: 32px; }
.cornerBR { bottom: 24px; right: 32px; }

.cover {
  display: flex;
  flex-direction: column;
}

.meta {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  margin: 0;
}

.headline {
  font-family: Georgia, "Times New Roman", "Songti SC", "STSong", serif;
  font-weight: 400;
  font-size: 56px;
  line-height: 1.04;
  letter-spacing: -0.012em;
  color: var(--color-text-primary);
  margin: 18px 0 0;
}

.sub {
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  margin: 14px 0 0;
  max-width: 56ch;
}

.rule {
  border: none;
  border-top: 1px solid var(--color-border-tertiary);
  margin: 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fieldAnimated {
  /* Height + opacity transition for the Name field insertion. */
  animation: fieldIn 180ms var(--easing-standard) both;
}

@keyframes fieldIn {
  from { opacity: 0; transform: translateY(-4px); max-height: 0; }
  to   { opacity: 1; transform: translateY(0);   max-height: 200px; }
}

.label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

.input {
  height: 40px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--color-border-secondary);
  border-radius: 0;
  padding: 0 2px;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-text-primary);
  transition: border-color var(--motion-fast) var(--easing-standard);
}

.input::placeholder { color: var(--color-text-tertiary); }
.input:focus { border-bottom-color: var(--color-text-primary); outline: none; }

.error {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-danger);
  margin: 0;
  min-height: 0;
}

.footerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.switch {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-tertiary);
}

.switchButton {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: var(--color-text-primary);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  cursor: pointer;
}

.switchButton[disabled] {
  cursor: not-allowed;
  color: var(--color-text-tertiary);
}

.button {
  height: 40px;
  min-width: 120px;
  padding: 0 24px;
  background: var(--color-text-primary);
  color: #fff;
  border: none;
  border-radius: var(--border-radius-md);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color var(--motion-fast) var(--easing-standard);
}

.button:hover:not([disabled]) {
  background: var(--color-text-secondary);
}

.button[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.spinner {
  width: 1em;
  height: 1em;
  animation: spin 800ms linear infinite;
}

.spinnerCircle {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 60 100;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pageFooter {
  margin-top: 24px;
  padding: 14px 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

/* ── Tablet ── */
@media (max-width: 1023px) {
  .card {
    max-width: 720px;
    padding: 56px 56px 48px;
    gap: 48px;
  }
  .headline { font-size: 48px; }
}

/* ── Phone ── */
@media (max-width: 640px) {
  .page { padding: 0; }
  .card {
    max-width: 100%;
    border: none;
    border-radius: 0;
    padding: 40px 28px 32px;
    gap: 36px;
  }
  .headline { font-size: 40px; line-height: 1.05; }
  .footerRow { flex-direction: column; align-items: stretch; }
  .button { width: 100%; }
  .corner { display: none; }
}

/* Hide corner marks on the smallest phones where space is at a premium. */
@media (max-width: 480px) {
  .corner { display: none; }
}

/* Reduced motion: skip the Name-field entrance animation. */
@media (prefers-reduced-motion: reduce) {
  .fieldAnimated { animation: none; }
  .spinner { animation-duration: 1.5s; }
}
```

- [ ] **Step 2: Verify the file is empty-of-runtime-errors by importing it**

`LoginScreen.tsx` does not yet import this file — that is fine. The test in Task 3 will pick it up. No commit yet; the file goes in as part of Task 3.

---

## Task 3: Render default login copy (TDD)

**Files:**
- Modify: `packages/web/src/components/auth/LoginScreen.tsx`
- Create: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Write the failing test for default login render**

Create `packages/web/tests/LoginScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../src/components/auth/LoginScreen';

// Mock the API module before importing the component.
vi.mock('../src/api/auth.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

// api/client is not exercised here yet; importing it is harmless.
import { ApiError } from '../src/api/client.js';

describe('LoginScreen default render (T1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the magazine-cover copy and the email + password fields', () => {
    render(<LoginScreen onSuccess={() => {}} />);

    // Headline + meta
    expect(
      screen.getByRole('heading', { level: 1, name: /an archive, organized/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/vol\. 01 \/ no\. 26 \/ 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in to your library/i)).toBeInTheDocument();

    // Fields (login mode: no name)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();

    // Submit button
    expect(
      screen.getByRole('button', { name: /^sign in\s*→?$/i }),
    ).toBeInTheDocument();

    // Mode switch
    expect(
      screen.getByRole('button', { name: /^register$/i }),
    ).toBeInTheDocument();

    // No error visible
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: FAIL — `screen.getByRole('heading', ...)` cannot find the headline. The component currently renders an `<h1>Sign in</h1>`, not "An archive, organized." (the file we just wrote references styles that don't exist yet, but the JSX in `LoginScreen.tsx` is still the old version).

- [ ] **Step 3: Rewrite `LoginScreen.tsx` to use the new CSS module**

Replace the entire contents of `packages/web/src/components/auth/LoginScreen.tsx` with:

```tsx
import { useState, type FormEvent } from 'react';
import { register as apiRegister, login as apiLogin } from '../../api/auth.js';
import { ApiError } from '../../api/client.js';
import styles from './LoginScreen.module.css';

type Mode = 'login' | 'register';

const COPY = {
  login: {
    sub: 'Sign in to your library. A calm place to find, file, and finish with the assets you make.',
    button: 'Sign in →',
    switchPrompt: 'No account? ',
    switchAction: 'Register',
  },
  register: {
    sub: "Start your collection. We'll set up a workspace in under a minute.",
    button: 'Create account →',
    switchPrompt: 'Have an account? ',
    switchAction: 'Sign in',
  },
} as const;

const SPINNER_ID = 'login-screen-spinner';

function isValidEmail(value: string): boolean {
  // Lightweight client-side check; the server is the source of truth.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = COPY[mode];

  const toggleMode = () => {
    if (busy) return;
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    // Client-side validation. Order matters: check fields in the order the
    // user fills them so the first empty one is the one that complains.
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();
    if (mode === 'register' && trimmedName === '') {
      setError('Name is required.');
      return;
    }
    if (trimmedEmail === '') {
      setError('Email is required.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError("That doesn't look like an email.");
      return;
    }
    if (password === '') {
      setError('Password is required.');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        await apiRegister({ email: trimmedEmail, password, displayName: trimmedName });
      } else {
        await apiLogin({ email: trimmedEmail, password });
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <span className={`${styles.corner} ${styles.cornerTL}`} aria-hidden="true">
          DAM-Link · est. 2026
        </span>
        <span className={`${styles.corner} ${styles.cornerBR}`} aria-hidden="true">
          P. 01 / 01
        </span>

        <header className={styles.cover}>
          <p className={styles.meta}>VOL. 01 / NO. 26 / 2026</p>
          <h1 className={styles.headline}>An archive, organized.</h1>
          <p className={styles.sub}>{copy.sub}</p>
        </header>

        <div>
          <hr className={styles.rule} />
          <form className={styles.form} onSubmit={onSubmit} noValidate aria-busy={busy}>
            {mode === 'register' && (
              <div className={`${styles.field} ${styles.fieldAnimated}`}>
                <label htmlFor="login-name" className={styles.label}>
                  Name
                </label>
                <input
                  id="login-name"
                  className={styles.input}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className={styles.field}>
              <label htmlFor="login-email" className={styles.label}>
                Email
              </label>
              <input
                id="login-email"
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@studio.com"
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="login-password" className={styles.label}>
                Password
              </label>
              <input
                id="login-password"
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={mode === 'register' ? 8 : undefined}
                placeholder={mode === 'register' ? 'At least 8 characters' : undefined}
                required
              />
            </div>

            {error !== null && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}

            <div className={styles.footerRow}>
              <span className={styles.switch}>
                {copy.switchPrompt}
                <button
                  type="button"
                  className={styles.switchButton}
                  onClick={toggleMode}
                  disabled={busy}
                >
                  {copy.switchAction}
                </button>
              </span>
              <button type="submit" className={styles.button} disabled={busy}>
                {busy ? (
                  <svg
                    className={styles.spinner}
                    viewBox="0 0 24 24"
                    data-testid={SPINNER_ID}
                    aria-hidden="true"
                  >
                    <circle
                      className={styles.spinnerCircle}
                      cx="12"
                      cy="12"
                      r="9"
                    />
                  </svg>
                ) : (
                  copy.button
                )}
              </button>
            </div>
          </form>
        </div>
      </article>

      <footer className={styles.pageFooter}>DAM-LINK · A DIGITAL ASSET LIBRARY</footer>
    </main>
  );
}
```

- [ ] **Step 4: Run the test, expect it to pass**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 1 passed. The component renders the cover line, meta, sub, email + password fields, the Sign in button, the Register switch, and no error.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/auth/LoginScreen.module.css \
        packages/web/src/components/auth/LoginScreen.tsx \
        packages/web/tests/LoginScreen.test.tsx
git commit -m "feat(web): redesign login page — magazine cover default render

CSS module + component rewrite. Editorial / archival design (Georgia
display, system sans/mono, monochrome, stacked bottom-border form).
First test covers the default login render. More behavior tests
follow in subsequent commits."
```

---

## Task 4: Mode switching (TDD)

**Files:**
- Modify: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Add the failing test for register-mode switch**

Append a new `describe` block to `packages/web/tests/LoginScreen.test.tsx`:

```tsx
describe('LoginScreen mode switching (T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches to register: shows Name field, updates copy, swaps button label', async () => {
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);

    // Default state
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^sign in\s*→?$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sign in to your library/i)).toBeInTheDocument();

    // Click the switch
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    // Register state
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^create account\s*→?$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/start your collection/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^sign in$/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 1 passed (T1), 1 failed (T2 — the switch button is found and the test fails on the assertion that the Name field is absent in login mode, or on the create-account button).

- [ ] **Step 3: Implement the mode switch (already in Task 3's code)**

The implementation in Task 3 already includes `toggleMode`, the conditional `Name` field, and the per-mode copy. No new code change is required — the test will pass against the current `LoginScreen.tsx`.

- [ ] **Step 4: Run the test, confirm it passes**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/tests/LoginScreen.test.tsx
git commit -m "test(web): login screen mode switch — name field + copy swap"
```

---

## Task 5: Client-side validation (TDD)

**Files:**
- Modify: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Add the failing tests for validation**

Append to `packages/web/tests/LoginScreen.test.tsx`:

```tsx
import { login as apiLogin, register as apiRegister } from '../src/api/auth.js';

describe('LoginScreen client-side validation (T3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submit on empty email and does not call the API', async () => {
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/email is required/i);
    expect(apiLogin).not.toHaveBeenCalled();
  });

  it('blocks submit on invalid email format', async () => {
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);
    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/doesn't look like an email/i);
    expect(apiLogin).not.toHaveBeenCalled();
  });

  it('blocks submit on empty password', async () => {
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);
    await user.type(screen.getByLabelText(/^email$/i), 'me@studio.com');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/password is required/i);
    expect(apiLogin).not.toHaveBeenCalled();
  });

  it('blocks register submit on empty name and short password', async () => {
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    // Fill name + email but a 3-char password.
    await user.type(screen.getByLabelText(/^name$/i), 'Alex');
    await user.type(screen.getByLabelText(/^email$/i), 'alex@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'abc');
    await user.click(
      screen.getByRole('button', { name: /^create account\s*→?$/i }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(apiRegister).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 2 passed (T1 + T2), the 4 new tests fail (they expect an error `<p role="alert">` and the API not to be called; with `noValidate` removed, the browser would normally block submit, but in jsdom the form just submits).

- [ ] **Step 3: Verify the implementation is in place**

Task 3's `LoginScreen.tsx` already includes:
- The `isValidEmail` helper.
- The validation block in `onSubmit` (name → email → password → password length, in that order).
- `setError('...')` calls and early returns.
- The `noValidate` attribute on the `<form>` so the browser's native validation doesn't pre-empt ours.

No new code is required.

- [ ] **Step 4: Run the test, confirm it passes**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 6 passed (T1 + T2 + 4 validation tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/tests/LoginScreen.test.tsx
git commit -m "test(web): login screen client-side validation (email/password/name/length)"
```

---

## Task 6: Successful API call wiring (TDD)

**Files:**
- Modify: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append to `packages/web/tests/LoginScreen.test.tsx`:

```tsx
describe('LoginScreen successful API call (T4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiLogin).mockResolvedValue({ user: { id: 'u1', email: 'me@studio.com', displayName: 'Me' } });
    vi.mocked(apiRegister).mockResolvedValue({ user: { id: 'u2', email: 'alex@studio.com', displayName: 'Alex' } });
  });

  it('valid login calls apiLogin once and fires onSuccess', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<LoginScreen onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/^email$/i), 'me@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    expect(apiLogin).toHaveBeenCalledTimes(1);
    expect(apiLogin).toHaveBeenCalledWith({
      email: 'me@studio.com',
      password: 'longenoughpassword',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('valid register calls apiRegister with the trimmed displayName', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<LoginScreen onSuccess={onSuccess} />);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    await user.type(screen.getByLabelText(/^name$/i), '  Alex  ');
    await user.type(screen.getByLabelText(/^email$/i), 'alex@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(
      screen.getByRole('button', { name: /^create account\s*→?$/i }),
    );

    expect(apiRegister).toHaveBeenCalledTimes(1);
    expect(apiRegister).toHaveBeenCalledWith({
      email: 'alex@studio.com',
      password: 'longenoughpassword',
      displayName: 'Alex',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 6 passed, 2 failed (the new tests expect `apiLogin`/`apiRegister` to be called, but with `vi.clearAllMocks()` and a clean component they will not be — the test environment has no `@testing-library/user-event` typing for `vi.mocked` without an explicit cast; we'll fix that in step 3 if needed).

- [ ] **Step 3: Confirm typing**

`vi.mocked(apiLogin)` returns the typed mock. The TS strict mode in this repo (`tsconfig.app.json` + `tsconfig.test.json`) requires the import to be of a vi-mocked module. The `import { login as apiLogin } from '../src/api/auth.js'` at the top of the test file is already typed as a function; after `vi.mock`, it's a `MockedFunction`. `vi.mocked()` gives the right type. If TypeScript complains at `tsc -b`, add `as unknown as MockedFunction<typeof apiLogin>` — but this is rare. Run `pnpm -F @dam-link/web exec tsc -b` to confirm.

- [ ] **Step 4: Run the test, confirm it passes**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/tests/LoginScreen.test.tsx
git commit -m "test(web): login screen API success — login + register, trimmed displayName"
```

---

## Task 7: Server error handling (TDD)

**Files:**
- Modify: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append to `packages/web/tests/LoginScreen.test.tsx`:

```tsx
describe('LoginScreen error handling (T5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the ApiError message verbatim in an alert region', async () => {
    vi.mocked(apiLogin).mockRejectedValueOnce(
      new ApiError(401, 'BAD_CREDENTIALS', 'Invalid email or password.'),
    );
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);

    await user.type(screen.getByLabelText(/^email$/i), 'me@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid email or password\./i);
  });

  it('falls back to a generic message on a non-ApiError', async () => {
    vi.mocked(apiLogin).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);

    await user.type(screen.getByLabelText(/^email$/i), 'me@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 8 passed, 2 failed.

- [ ] **Step 3: Verify the implementation**

Task 3's `LoginScreen.tsx` already has the `try/catch` with `instanceof ApiError` branching and the `setError('Something went wrong. Check your connection and try again.')` fallback. No new code.

- [ ] **Step 4: Run the test, confirm it passes**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/tests/LoginScreen.test.tsx
git commit -m "test(web): login screen error rendering — ApiError + network fallback"
```

---

## Task 8: Loading state — Spinner + disabled switch (TDD)

**Files:**
- Modify: `packages/web/tests/LoginScreen.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append to `packages/web/tests/LoginScreen.test.tsx`:

```tsx
describe('LoginScreen loading state (T6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Spinner inside the button while the request is in flight', async () => {
    let resolveLogin!: (v: { user: { id: string; email: string; displayName: string } }) => void;
    vi.mocked(apiLogin).mockImplementationOnce(
      () => new Promise((resolve) => { resolveLogin = resolve; }),
    );
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);

    await user.type(screen.getByLabelText(/^email$/i), 'me@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    // While pending: spinner present, button label gone, switch disabled.
    expect(screen.getByTestId('login-screen-spinner')).toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: /sign in\s*→/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /^register$/i })).toBeDisabled();

    // Resolve to clean up.
    resolveLogin({ user: { id: 'u1', email: 'me@studio.com', displayName: 'Me' } });
  });

  it('does not change mode when the switch is clicked while busy', async () => {
    let resolveLogin!: (v: { user: { id: string; email: string; displayName: string } }) => void;
    vi.mocked(apiLogin).mockImplementationOnce(
      () => new Promise((resolve) => { resolveLogin = resolve; }),
    );
    const user = userEvent.setup();
    render(<LoginScreen onSuccess={() => {}} />);

    await user.type(screen.getByLabelText(/^email$/i), 'me@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    // Try to switch — the button is disabled, so a click is a no-op.
    const switchBtn = screen.getByRole('button', { name: /^register$/i });
    expect(switchBtn).toBeDisabled();
    await user.click(switchBtn);

    // Still in login mode — no Name field visible, button label is Sign in.
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();

    resolveLogin({ user: { id: 'u1', email: 'me@studio.com', displayName: 'Me' } });
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 10 passed, 2 failed (the first new test asserts the spinner testid exists; the second asserts the switch is disabled).

- [ ] **Step 3: Verify the implementation**

Task 3's `LoginScreen.tsx` already:
- Sets `busy` before the API call, clears it in `finally`.
- Renders `<svg data-testid="login-screen-spinner">` inside the button when `busy`.
- Disables both the submit button and the switch button when `busy`.
- Guards `toggleMode` with `if (busy) return;` for the case where a keyboard-only user somehow triggers it.

No new code.

- [ ] **Step 4: Run the test, confirm it passes**

```bash
pnpm -F @dam-link/web test -- tests/LoginScreen.test.tsx
```

Expected: 12 passed. All 12 spec tests are now green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/tests/LoginScreen.test.tsx
git commit -m "test(web): login screen loading — Spinner + disabled switch + button"
```

---

## Task 9: Type-check + lint pass

**Files:** none new.

- [ ] **Step 1: Type-check the package**

```bash
pnpm -F @dam-link/web exec tsc -b
```

Expected: zero errors. If any type complaint appears (e.g., the unused `SPINNER_ID` const), remove it.

- [ ] **Step 2: Lint the package**

```bash
pnpm -F @dam-link/web lint
```

Expected: zero errors and zero warnings. The repo runs ESLint flat config (see `eslint.config.js`). Common fixes if anything trips: `react-refresh/only-export-components` may flag the `LoginScreen` export — already a top-level export, fine. If `noUnusedLocals` complains about the `SPINNER_ID` import, remove it.

- [ ] **Step 3: Run the full web test suite to make sure we haven't broken anything else**

```bash
pnpm -F @dam-link/web test
```

Expected: all suites pass. This is a contained change so no other tests should regress, but verify.

- [ ] **Step 4: Commit any fixes (if any)**

```bash
git add -u
git diff --cached --quiet || git commit -m "chore(web): address lint/type findings in login screen"
```

---

## Task 10: Visual verification — desktop

**Files:** none new.

- [ ] **Step 1: Start the dev server**

```bash
pnpm -F @dam-link/web dev
```

Expected: Vite serves on `http://localhost:5173`. Open it in a browser.

- [ ] **Step 2: Visually verify the desktop layout**

The Vite proxy will forward `/api/*` to `http://localhost:3000` — but we don't need the API for the visual; the login page is the only thing rendered when not authed.

Confirm the following match the spec's §4 ASCII diagram:
- [ ] Card centered, ~880px max-width, with hairline border and `--border-radius-lg`.
- [ ] Top-left corner: `DAM-Link · est. 2026` (mono, uppercase, tertiary). Bottom-right: `P. 01 / 01`.
- [ ] Mono meta line: `VOL. 01 / NO. 26 / 2026`.
- [ ] Georgia headline: `An archive, organized.` at ~56px.
- [ ] Sub line: `Sign in to your library. A calm place to find, file, and finish with the assets you make.`
- [ ] Hairline rule.
- [ ] `EMAIL` / `PASSWORD` labels (mono, uppercase), inputs with bottom border only.
- [ ] Bottom row: `No account? Register` on the left, `Sign in →` button on the right (black, white text).
- [ ] Page footer band: `DAM-LINK · A DIGITAL ASSET LIBRARY` (mono, uppercase, centered, hairline above).

If anything is off, fix the CSS in `LoginScreen.module.css` and re-check.

- [ ] **Step 3: Test the focus state**

Tab into the form. The focused input should have its bottom border thicken from `--color-border-secondary` to `--color-text-primary` (no box-shadow; the magazine idiom).

- [ ] **Step 4: Test the register mode**

Click `Register`. The Name field animates in (height + opacity, 180ms), the sub changes to `Start your collection...`, the button becomes `Create account →`, the switch becomes `Have an account? Sign in`.

- [ ] **Step 5: Test client-side validation**

With the dev server still running, submit an empty form. The error `<p role="alert">` should appear in red (`--color-text-danger`) and the API should not be called (visible in the Network tab).

- [ ] **Step 6: Stop the dev server**

```bash
# Press Ctrl+C in the terminal running the dev server.
```

- [ ] **Step 7: Commit any visual fixes**

```bash
git add -u
git diff --cached --quiet || git commit -m "fix(web): login screen visual polish (desktop)"
```

---

## Task 11: Visual verification — responsive

**Files:** none new.

- [ ] **Step 1: Verify the tablet viewport (768×1024)**

Re-start the dev server (`pnpm -F @dam-link/web dev`). Open Chrome DevTools, device toolbar, set to 768×1024 (iPad portrait).

Confirm:
- [ ] Card max-width is ~720px.
- [ ] Card padding reduced to 56px 56px.
- [ ] Headline at 48px.
- [ ] Corner marks still visible.
- [ ] Form still on one column (no wrap).

- [ ] **Step 2: Verify the phone viewport (390×844)**

Set DevTools to 390×844 (iPhone 14).

Confirm:
- [ ] Card has no border / radius; flush with the page background.
- [ ] Card padding: 40px 28px.
- [ ] Headline at 40px.
- [ ] Corner marks hidden (≤480).
- [ ] Footer row stacks vertically — switch on top, full-width `Sign in →` button below.

- [ ] **Step 3: Test the prefers-reduced-motion override**

In DevTools, open the Command Palette → "Show Rendering" → set "Emulate CSS media feature prefers-reduced-motion" to `reduce`. Reload. Click `Register`. The Name field should appear instantly with no animation; the spinner rotation should slow.

Reset to `no-preference` when done.

- [ ] **Step 4: Stop the dev server**

```bash
# Press Ctrl+C
```

- [ ] **Step 5: Commit any responsive fixes**

```bash
git add -u
git diff --cached --quiet || git commit -m "fix(web): login screen responsive polish"
```

---

## Task 12: Final acceptance — before/after screenshot, lint, full test

**Files:** none new.

- [ ] **Step 1: Take a "before" screenshot from git history**

```bash
cd /d/DAM-Link-Backend
git show main:packages/web/src/components/auth/LoginScreen.tsx > /tmp/login-before.tsx
```

We won't run a server against the old code (too time-consuming); instead, attach the diff itself to the PR description and let the reviewer compare visually in the browser.

- [ ] **Step 2: Take an "after" screenshot using the smoke runner**

The repo has `packages/web/smoke.py` and `packages/web/smoke-shots/` from Plan 9. Run the smoke test for the web build:

```bash
cd /d/DAM-Link-Backend
pnpm -F @dam-link/web build
python3 packages/web/smoke.py web
```

Expected: build succeeds; smoke test fetches the homepage and asserts a 200 + version. Then visually inspect the deployed dev URL to confirm the login page renders.

(If `smoke.py` is auth-required and a logged-out state isn't tested, the screenshot of the dev server is the canonical artifact — paste it into the PR.)

- [ ] **Step 3: Final lint + type + test pass**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-page-redesign
pnpm -F @dam-link/web exec tsc -b
pnpm -F @dam-link/web lint
pnpm -F @dam-link/web test
```

Expected: zero errors, zero warnings, all 12 LoginScreen tests pass + the rest of the web suite is green.

- [ ] **Step 4: Verify the spec's acceptance criteria one by one**

Open `docs/superpowers/specs/2026-06-06-login-page-redesign-design.md` §13 and check each item:
- [ ] Only `LoginScreen.tsx`, `LoginScreen.module.css`, and `tests/LoginScreen.test.tsx` changed (plus the spec/gitignore from the brainstorming phase, which are in commit `79ffb76` on main, not this branch).
- [ ] All 12 tests pass.
- [ ] `pnpm -F web lint` and `pnpm -F web test` pass.
- [ ] The login page renders as in §4 on every viewport in §7 (verified in Tasks 10–11).
- [ ] `prefers-reduced-motion: reduce` removes the name-field animation (verified in Task 11 Step 3).
- [ ] A screen reader announces the error and the mode switch (manual: VoiceOver/NVDA, or `aria-live` / `role="alert"` code review).

- [ ] **Step 5: Push the branch and open a PR**

```bash
cd /d/DAM-Link-Backend/.worktrees/login-page-redesign
git push -u origin feat/login-page-redesign
gh pr create --base main --title "feat(web): redesign login page" --body "$(cat <<'EOF'
## Summary
- Replaces the unstyled `LoginScreen` with a designed editorial / magazine-cover login page.
- Magazine-cover layout, Georgia display + system sans/mono, pure type + whitespace.
- Stacked label-above form, monochrome palette, single accent (danger red on error only).
- New CSS module (`LoginScreen.module.css`); component rewrite; 12-test suite.
- No backend, no API, no other component changes. Public signature of `LoginScreen` preserved.

## Test plan
- [x] 12 spec tests pass (default render, mode switch, validation, API success, error rendering, loading state).
- [x] Full web suite green.
- [x] `pnpm -F @dam-link/web lint` clean.
- [x] `pnpm -F @dam-link/web exec tsc -b` clean.
- [x] Visual review at desktop (1280), tablet (768), phone (390).
- [x] `prefers-reduced-motion: reduce` honored.

## Spec
docs/superpowers/specs/2026-06-06-login-page-redesign-design.md (commit 79ffb76)
EOF
)"
```

Expected: PR is open and the URL is returned.

- [ ] **Step 6: Final commit — none expected, all changes should be in feature commits already**

If a fix landed in this task, commit it under `chore(web): ...` or `docs(web): ...` and `git push` to update the PR.

---

## Out of scope (do NOT do in this plan)

- Forgot-password / SSO / email verification / dark mode (spec §8).
- A `--font-serif` token in `tokens.css` (deferred per spec §5.4).
- Mount-time fade-in animation for the page (spec §8).
- Changing `App.tsx`, `src/api/auth.ts`, `src/api/client.ts`, or any other component.
- Any backend or database work.

---

## Self-review (post-write)

1. **Spec coverage:**
   - §4 composition → Task 2 (CSS), Task 3 (TSX).
   - §4.1 mode copy → Task 3 (COPY const), Task 4 (test).
   - §4.2 type scale → Task 2 (CSS).
   - §4.3 color & motion → Task 2 (CSS).
   - §4.4 component anatomy → Task 3 (TSX).
   - §5.1 CSS module → Task 2.
   - §5.2 TSX edits (id attrs, switch button, Spinner, COPY, noValidate) → Task 3.
   - §5.3 test file → Tasks 3–8.
   - §5.4 unchanged files → enforced (Tasks 1, 3, 12).
   - §6 validation table → Task 5.
   - §6.1 server errors → Task 7.
   - §6.2 loading → Task 8.
   - §7 responsive table → Task 11.
   - §8 out of scope → Out-of-scope section above.
   - §9 12-test plan → Tasks 3, 4, 5, 6, 7, 8 (12 tests across 6 describe blocks).
   - §10 a11y checklist → §4.4 + Task 2 CSS focus styles + Task 10 manual.
   - §11 rollout → Task 1 (worktree) + Task 12 (PR).
   - §13 acceptance → Task 12 Step 4.

2. **Placeholder scan:** None. Every test has actual code; every CSS rule has a selector and properties; every TSX block is complete.

3. **Type consistency:**
   - `vi.mocked(apiLogin)` / `vi.mocked(apiRegister)` — used identically in Tasks 6, 7, 8.
   - `SPINNER_ID` is referenced once in the testid and once in the TSX; the const lives in TSX and the test uses the literal string `'login-screen-spinner'`. If the const changes, the test breaks visibly — acceptable. Alternative: export the const from the TSX. Chosen to keep the test independent of the const.
   - `ApiError(401, 'BAD_CREDENTIALS', 'Invalid email or password.')` — matches the real `ApiError` constructor shape `(status, code, message, details?)` from `src/api/client.ts:8`.
   - `apiLogin` / `apiRegister` arg shapes match `src/api/auth.ts:4-10`.
   - `LoginScreen` props are `{ onSuccess: () => void }` — matches the existing consumer in `App.tsx:360`.
