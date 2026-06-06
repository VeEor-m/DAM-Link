import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../src/components/auth/LoginScreen';

// Mock the API module before importing the component.
vi.mock('../src/api/auth.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../src/lib/animations/login-screen.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createMountEntrance: vi.fn(() => gsap.timeline({ paused: true })),
    createModeSwitchTimeline: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

import { login as apiLogin, register as apiRegister } from '../src/api/auth.js';
import { ApiError } from '../src/api/client.js';
import * as loginScreenAnimations from '../src/lib/animations/login-screen.js';
import { gsap } from '../src/lib/gsap-setup.js';

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

describe('LoginScreen loading state (T6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Spinner inside the button while the request is in flight', async () => {
    let resolveLogin!: (v: { user: { id: string; email: string; displayName: string; createdAt: string } }) => void;
    vi.mocked(apiLogin).mockImplementationOnce(
      () => new Promise((resolve) => { resolveLogin = resolve; }),
    );
    const user = userEvent.setup();
    const { container } = render(<LoginScreen onSuccess={() => {}} />);

    await user.type(screen.getByLabelText(/^email$/i), 'me@studio.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /^sign in\s*→?$/i }));

    // While pending: spinner present, submit button disabled and contains the spinner, switch disabled.
    const spinner = screen.getByTestId('login-screen-spinner');
    expect(spinner).toBeInTheDocument();
    // The busy submit button has no accessible name (the SVG is aria-hidden), so find it by type=submit.
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton).toBeDisabled();
    expect(submitButton).toContainElement(spinner);
    expect(screen.getByRole('button', { name: /^register$/i })).toBeDisabled();

    // Resolve to clean up.
    resolveLogin({ user: { id: 'u1', email: 'me@studio.com', displayName: 'Me', createdAt: '2026-06-06T00:00:00.000Z' } });
  });

  it('does not change mode when the switch is clicked while busy', async () => {
    let resolveLogin!: (v: { user: { id: string; email: string; displayName: string; createdAt: string } }) => void;
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

    // Still in login mode — no Name field visible.
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();

    resolveLogin({ user: { id: 'u1', email: 'me@studio.com', displayName: 'Me', createdAt: '2026-06-06T00:00:00.000Z' } });
  });
});

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
