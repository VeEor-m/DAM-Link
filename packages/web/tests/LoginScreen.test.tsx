import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '../src/components/auth/LoginScreen';

// Mock the API module before importing the component.
vi.mock('../src/api/auth.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

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
