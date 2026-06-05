import { useState, type FormEvent } from 'react';
import { register as apiRegister, login as apiLogin } from '../../api/auth.js';
import { ApiError } from '../../api/client.js';

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await apiRegister({ email, password, displayName });
      } else {
        await apiLogin({ email, password });
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <form onSubmit={onSubmit}>
        {mode === 'register' && (
          <label>
            Name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account?' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
