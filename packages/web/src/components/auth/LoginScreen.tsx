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
  const [mode, setMode] = useState<LoginMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cardRef = useRef<HTMLElement>(null);
  const prevModeRef = useRef<LoginMode>('login');

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
      <article ref={cardRef} className={styles.card}>
        <span className={`${styles.corner} ${styles.cornerTL}`} aria-hidden="true" data-anim="corner">
          DAM-Link · est. 2026
        </span>
        <span className={`${styles.corner} ${styles.cornerBR}`} aria-hidden="true" data-anim="corner">
          P. 01 / 01
        </span>

        <header className={styles.cover}>
          <p className={styles.meta} data-anim="meta">VOL. 01 / NO. 26 / 2026</p>
          <h1 className={styles.headline} data-anim="headline">An archive, organized.</h1>
          <p className={styles.sub} data-anim="sub">{copy.sub}</p>
        </header>

        <div>
          <hr className={styles.rule} data-anim="rule" />
          <form className={styles.form} onSubmit={onSubmit} noValidate aria-busy={busy}>
            {mode === 'register' && (
              <div className={styles.field} data-anim="name-field">
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
            <div className={styles.field} data-anim="field">
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
            <div className={styles.field} data-anim="field">
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

            <div className={styles.footerRow} data-anim="footer">
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
