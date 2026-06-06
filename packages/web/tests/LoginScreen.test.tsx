import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../src/components/auth/LoginScreen';

// Mock the API module before importing the component.
vi.mock('../src/api/auth.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

import { login as apiLogin, register as apiRegister } from '../src/api/auth.js';

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

describe('LoginScreen successful API call (T4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiLogin).mockResolvedValue({ user: { id: 'u1', email: 'me@studio.com', displayName: 'Me', createdAt: '2026-06-06T00:00:00.000Z' } });
    vi.mocked(apiRegister).mockResolvedValue({ user: { id: 'u2', email: 'alex@studio.com', displayName: 'Alex', createdAt: '2026-06-06T00:00:00.000Z' } });
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
